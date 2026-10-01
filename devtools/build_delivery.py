"""Build and smoke-test the standalone ZCode local marketplace archive."""

import hashlib
import json
import os
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
VERSION = json.loads((ROOT / "marketplace.json").read_text(encoding="utf-8"))["plugins"][0]["version"]
ARCHIVE = DIST / f"quality-gate-{VERSION}.zip"
EXCLUDED_TOP_LEVEL = {".git", "dist", "devtools", "acceptance", ".zcode", "evidence", "graphify-out"}
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


def main() -> None:
    DIST.mkdir(exist_ok=True)
    files = sorted(path for path in ROOT.rglob("*") if path.is_file() and included(path))
    with zipfile.ZipFile(ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            info = zipfile.ZipInfo((Path("quality-gate") / path.relative_to(ROOT)).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    digest = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
    (DIST / f"quality-gate-{VERSION}.sha256").write_text(f"{digest}  {ARCHIVE.name}\n", encoding="ascii")

    with tempfile.TemporaryDirectory(prefix="qgate-delivery-") as temporary:
        outer = Path(temporary)
        with zipfile.ZipFile(ARCHIVE) as archive:
            assert archive.testzip() is None, "Damaged archive"
            for member in archive.infolist():
                target = (outer / member.filename).resolve()
                assert target == outer or outer in target.parents, "Unsafe archive member"
            archive.extractall(outer)
        marketplace = outer / "quality-gate"
        catalog = json.loads((marketplace / "marketplace.json").read_text(encoding="utf-8"))
        item = catalog["plugins"][0]
        assert item["version"] == VERSION
        plugin = (marketplace / item["source"]).resolve()
        assert plugin.is_dir() and plugin.parent == (marketplace / "plugins").resolve()
        manifest = json.loads((plugin / ".zcode-plugin" / "plugin.json").read_text(encoding="utf-8"))
        assert manifest["version"] == VERSION
        # 套件并发钳制（与根门禁 devtools/run-suite.mjs 同规则）：目标持续利用率 ≤75%。
        # 超线程机器按逻辑核×0.75 会打满物理核（实测 24 逻辑核/18 并发→持续 100%），
        # 故按物理核×0.75≈逻辑核×0.375 钳制（实测 9 并发→持续段 74%）
        concurrency = max(2, (os.cpu_count() or 1) * 3 // 8)
        tests = run_checked(["node", "--test", f"--test-concurrency={concurrency}", *map(str, sorted((plugin / "tests").glob("*.test.mjs")))], plugin)
        # 计数随版本演进，不在此硬编码：以零失败 + 可解析的测试计数为准
        count = re.search(r"^ℹ tests (\d+)$", tests.stdout, re.M)
        assert count and f"fail {count.group(1)}" not in tests.stdout and "fail 0" in tests.stdout, "Test failures detected"
        # 烟测清单来自 examples/examples.manifest.json(单一事实源,tests/examples.test.mjs 强制同步)
        manifest = json.loads((plugin / "examples" / "examples.manifest.json").read_text(encoding="utf-8"))
        smoke = [(entry["id"], entry["smokeStage"]) for entry in manifest["entries"] if entry["smokeStage"]]
        assert smoke, "no smoke demos configured"
        for demo, stage in smoke:
            result = run_checked(["node", str(plugin / "bin" / "qgate.mjs"), str(plugin / "examples" / demo), stage], plugin)
            report = json.loads(result.stdout)
            assert report["status"] == "PASS", f"{demo}: {report.get('status')}"
    passed = re.search(r"^ℹ pass (\d+)$", tests.stdout, re.M)
    skipped = re.search(r"^ℹ skipped (\d+)$", tests.stdout, re.M)
    assert passed and skipped, "Missing test result counts"
    print(f"{ARCHIVE.name}: {len(files)} files, SHA256 {digest}; extracted {count.group(1)} tests: {passed.group(1)} PASS, {skipped.group(1)} SKIP; {len(smoke)} demos PASS")
    print("next: to deliver this version to the ZCode client, run `python devtools/sync_client_marketplace.py` then click 更新 (update) on the plugin row in the client (directory marketplaces support direct update); verify with the same script")


if __name__ == "__main__":
    main()
