"""Build and smoke-test the standalone ZCode local marketplace archive."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
VERSION = json.loads((ROOT / "marketplace.json").read_text(encoding="utf-8"))["plugins"][0]["version"]
ARCHIVE = DIST / f"quality-gate-{VERSION}.zip"
SHA_FILE = DIST / f"quality-gate-{VERSION}.sha256"
DELIVERY_MANIFEST = ROOT / "devtools" / "delivery-files.json"
EXCLUDED_TOP_LEVEL = {".git", "dist", "devtools", "acceptance", ".zcode", "evidence", "experiments", "graphify-out"}
EXCLUDED_FILES = {"AGENTS.md", ".gitignore", "PROJECT-HANDOFF.md"}


def included(path: Path) -> bool:
    parts = path.relative_to(ROOT).parts
    return (
        parts[0] not in EXCLUDED_TOP_LEVEL
        and not (len(parts) > 1 and parts[:2] == ("docs", "context"))
        and ".quality-gate" not in parts
        and "__pycache__" not in parts
        and "node_modules" not in parts
        and not path.name.startswith(".env")
        and path.name not in EXCLUDED_FILES
        and path.suffix not in {".pyc", ".pyo", ".pem", ".key", ".log"}
    )


def run_checked(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"{' '.join(args)} failed:\n{(result.stdout + result.stderr)[-3000:]}")
    return result


def delivery_files() -> list[Path]:
    """Read the reviewed allowlist. Files outside it cannot enter the package."""
    data = json.loads(DELIVERY_MANIFEST.read_text(encoding="utf-8"))
    if set(data) != {"schemaVersion", "files"} or data["schemaVersion"] != "0.1":
        raise RuntimeError("Invalid delivery manifest header")
    names = data["files"]
    if not isinstance(names, list) or not names or names != sorted(set(names)):
        raise RuntimeError("Delivery manifest must have unique, sorted file names")
    files = []
    base = ROOT.resolve(strict=True)
    for name in names:
        if not isinstance(name, str) or not name or "\\" in name or ":" in name or "\0" in name:
            raise RuntimeError(f"Invalid delivery path: {name!r}")
        parts = name.split("/")
        if any(part in {"", ".", ".."} for part in parts):
            raise RuntimeError(f"Invalid delivery path: {name!r}")
        file = ROOT.joinpath(*parts)
        current = ROOT
        for part in parts:
            current = current / part
            if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
                raise RuntimeError(f"Symlink or junction in delivery path: {name}")
        if not included(file):
            raise RuntimeError(f"Excluded path in delivery manifest: {name}")
        try:
            resolved = file.resolve(strict=True)
        except OSError as error:
            raise RuntimeError(f"Missing delivery file: {name}") from error
        if base not in resolved.parents or not resolved.is_file():
            raise RuntimeError(f"Delivery file escapes repository or is not regular: {name}")
        files.append(file)
    required = {"marketplace.json", "plugins/quality-gate/package.json", "plugins/quality-gate/.zcode-plugin/plugin.json", f"docs/release/RELEASE-{VERSION}.md"}
    missing = required - set(names)
    if missing:
        raise RuntimeError(f"Required delivery files absent from manifest: {sorted(missing)}")
    return files


def assert_committed_source(files: list[Path]) -> None:
    """Normal publication must package the committed tree, not an unreviewed edit."""
    tracked = set(run_checked(["git", "ls-tree", "-r", "--name-only", "HEAD"], ROOT).stdout.splitlines())
    names = {path.relative_to(ROOT).as_posix() for path in files}
    if names - tracked:
        raise RuntimeError(f"Delivery manifest contains uncommitted paths: {sorted(names - tracked)[:5]}")
    if subprocess.run(["git", "diff", "--quiet", "HEAD", "--"], cwd=ROOT).returncode != 0:
        raise RuntimeError("Tracked source has uncommitted changes; commit before publishing (or use --verify-only)")


def assert_indexed_source(files: list[Path]) -> None:
    """Pre-commit validation may use staged files, never an unreviewed ignored output."""
    indexed = set(run_checked(["git", "ls-files", "--cached", "-z"], ROOT).stdout.split("\0"))
    names = {path.relative_to(ROOT).as_posix() for path in files}
    if names - indexed:
        raise RuntimeError(f"Delivery manifest contains files absent from the Git index: {sorted(names - indexed)[:5]}")


def committed_content(files: list[Path]) -> dict[str, bytes]:
    """Read exact HEAD blobs; checkout line endings must not alter the published bytes."""
    tree = subprocess.check_output(["git", "ls-tree", "-r", "-z", "HEAD"], cwd=ROOT)
    blobs = {}
    for entry in tree.split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        mode, kind, oid = metadata.decode("ascii").split()
        blobs[name.decode("utf-8")] = (mode, kind, oid)
    names = [path.relative_to(ROOT).as_posix() for path in files]
    for name in names:
        mode, kind, _ = blobs[name]
        if mode not in {"100644", "100755"} or kind != "blob":
            raise RuntimeError(f"Delivery file is not a regular Git blob: {name}")
    requested = [blobs[name][2] for name in names]
    process = subprocess.Popen(["git", "cat-file", "--batch"], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    data, stderr = process.communicate(("\n".join(requested) + "\n").encode("ascii"))
    if process.returncode:
        raise RuntimeError(f"Cannot read committed delivery files: {stderr.decode('utf-8', errors='replace')[-500:]}")
    offset = 0
    content = {}
    for name, oid in zip(names, requested):
        end = data.find(b"\n", offset)
        if end < 0:
            raise RuntimeError(f"Missing Git blob header for {name}")
        header = data[offset:end].decode("ascii").split()
        if len(header) != 3 or header[0] != oid or header[1] != "blob":
            raise RuntimeError(f"Unexpected Git blob header for {name}")
        size = int(header[2])
        offset = end + 1
        if size < 0 or offset + size >= len(data) or data[offset + size:offset + size + 1] != b"\n":
            raise RuntimeError(f"Truncated Git blob for {name}")
        content[name] = data[offset:offset + size]
        offset += size + 1
    if offset != len(data):
        raise RuntimeError("Unexpected trailing Git blob data")
    return content


def test_counts(output: str) -> dict[str, int]:
    counts = {key: int(value) for key, value in re.findall(r"^(?:ℹ|#)\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$", output, re.M)}
    if set(counts) != {"tests", "pass", "fail", "cancelled", "skipped", "todo"} or counts["tests"] <= 0 or counts["pass"] != counts["tests"] or any(counts[key] for key in ("fail", "cancelled", "skipped", "todo")):
        raise RuntimeError(f"Extracted test suite did not fully pass: {counts}; output tail: {output[-1200:]}")
    return counts


def publish(staged_archive: Path, staged_sha: Path) -> None:
    """Keep the prior zip/SHA pair intact if a publication write raises."""
    backup_archive = staged_archive.with_name("previous.zip")
    backup_sha = staged_sha.with_name("previous.sha256")
    if ARCHIVE.exists():
        shutil.copy2(ARCHIVE, backup_archive)
    if SHA_FILE.exists():
        shutil.copy2(SHA_FILE, backup_sha)
    try:
        os.replace(staged_archive, ARCHIVE)
        os.replace(staged_sha, SHA_FILE)
    except Exception:
        for target, backup in ((ARCHIVE, backup_archive), (SHA_FILE, backup_sha)):
            if backup.exists():
                os.replace(backup, target)
            elif target.exists():
                target.unlink()
        raise


def build(*, verify_only: bool = False) -> dict[str, object]:
    files = delivery_files()
    if verify_only:
        assert_indexed_source(files)
    else:
        assert_committed_source(files)
    source_bytes = None if verify_only else committed_content(files)
    run_checked([sys.executable, "-m", "unittest", "discover", "-s", "devtools/tests", "-p", "test_*.py"], ROOT)
    run_checked(["node", "--test", "devtools/tests/run-suite.test.mjs"], ROOT)
    DIST.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".qgate-build-", dir=DIST) as temporary:
        staging = Path(temporary)
        staged_archive = staging / ARCHIVE.name
        staged_sha = staging / SHA_FILE.name
        with zipfile.ZipFile(staged_archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in files:
                info = zipfile.ZipInfo((Path("quality-gate") / path.relative_to(ROOT)).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                name = path.relative_to(ROOT).as_posix()
                archive.writestr(info, path.read_bytes() if verify_only else source_bytes[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        digest = hashlib.sha256(staged_archive.read_bytes()).hexdigest()
        staged_sha.write_text(f"{digest}  {ARCHIVE.name}\n", encoding="ascii")
        with tempfile.TemporaryDirectory(prefix="qgate-delivery-") as extracted:
            outer = Path(extracted)
            with zipfile.ZipFile(staged_archive) as archive:
                if archive.testzip() is not None:
                    raise RuntimeError("Damaged archive")
                for member in archive.infolist():
                    target = (outer / member.filename).resolve()
                    if target != outer and outer not in target.parents:
                        raise RuntimeError(f"Unsafe archive member: {member.filename}")
                archive.extractall(outer)
            marketplace = outer / "quality-gate"
            catalog = json.loads((marketplace / "marketplace.json").read_text(encoding="utf-8"))
            item = catalog["plugins"][0]
            if item["version"] != VERSION:
                raise RuntimeError("Marketplace version differs from build version")
            plugin = (marketplace / item["source"]).resolve()
            if not plugin.is_dir() or plugin.parent != (marketplace / "plugins").resolve():
                raise RuntimeError("Invalid packaged plugin path")
            plugin_manifest = json.loads((plugin / ".zcode-plugin" / "plugin.json").read_text(encoding="utf-8"))
            package = json.loads((plugin / "package.json").read_text(encoding="utf-8"))
            if plugin_manifest["version"] != VERSION or package["version"] != VERSION:
                raise RuntimeError("Plugin version differs from build version")
            # Match devtools/run-suite.mjs: logical CPUs × 0.375 limits sustained CPU.
            concurrency = max(2, (os.cpu_count() or 1) * 3 // 8)
            tests = run_checked(["node", "--test", f"--test-concurrency={concurrency}", *map(str, sorted((plugin / "tests").glob("*.test.mjs")))], plugin)
            counts = test_counts(tests.stdout)
            manifest = json.loads((plugin / "examples" / "examples.manifest.json").read_text(encoding="utf-8"))
            smoke = [(entry["id"], entry["smokeStage"]) for entry in manifest["entries"] if entry["smokeStage"]]
            if not smoke:
                raise RuntimeError("No smoke demos configured")
            for demo, stage in smoke:
                result = run_checked(["node", str(plugin / "bin" / "qgate.mjs"), str(plugin / "examples" / demo), stage], plugin)
                report = json.loads(result.stdout)
                if report["status"] != "PASS":
                    raise RuntimeError(f"{demo}: {report.get('status')}")
        if not verify_only:
            publish(staged_archive, staged_sha)
        return {"archive": ARCHIVE.name, "files": len(files), "sha256": digest, "tests": counts, "demos": len(smoke), "published": not verify_only}


def main() -> None:
    if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] != "--verify-only"):
        raise SystemExit("Usage: python devtools/build_delivery.py [--verify-only]")
    verify_only = len(sys.argv) == 2
    result = build(verify_only=verify_only)
    mode = "verified without publishing" if verify_only else "published after extracted validation"
    print(f"{result['archive']}: {result['files']} files, SHA256 {result['sha256']}; extracted {result['tests']['tests']} tests: {result['tests']['pass']} PASS, {result['tests']['skipped']} SKIP; {result['demos']} demos PASS; {mode}")
    if not verify_only:
        print("next: sync the local marketplace snapshot, then update Quality Gate in the client; verify the cached version and hashes")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
