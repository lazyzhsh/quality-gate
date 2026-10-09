import hashlib
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "build_delivery.py"
SPEC = importlib.util.spec_from_file_location("build_delivery", MODULE_PATH)
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)


class DeliveryTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="qgate-build-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.dist = self.root / "dist"
        self.dist.mkdir()
        self.file_names = [
            "docs/release/RELEASE-2.0.0.md",
            "marketplace.json",
            "plugins/quality-gate/.zcode-plugin/plugin.json",
            "plugins/quality-gate/examples/demo/README.md",
            "plugins/quality-gate/examples/examples.manifest.json",
            "plugins/quality-gate/package.json",
            "plugins/quality-gate/tests/probe.test.mjs",
        ]
        content = {
            "marketplace.json": {"plugins": [{"version": "2.0.0", "source": "plugins/quality-gate"}]},
            "plugins/quality-gate/.zcode-plugin/plugin.json": {"version": "2.0.0"},
            "plugins/quality-gate/package.json": {"version": "2.0.0"},
            "plugins/quality-gate/examples/examples.manifest.json": {"entries": [{"id": "demo", "smokeStage": "close"}]},
        }
        for name in self.file_names:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(content[name]) if name in content else "fixture", encoding="utf-8")
        self.manifest = self.root / "devtools/delivery-files.json"
        self.manifest.parent.mkdir(parents=True)
        self.manifest.write_text(json.dumps({"schemaVersion": "0.1", "files": self.file_names}), encoding="utf-8")
        for attr, value in {
            "ROOT": self.root,
            "DIST": self.dist,
            "VERSION": "2.0.0",
            "ARCHIVE": self.dist / "quality-gate-2.0.0.zip",
            "SHA_FILE": self.dist / "quality-gate-2.0.0.sha256",
            "DELIVERY_MANIFEST": self.manifest,
        }.items():
            p = patch.object(build, attr, value)
            p.start()
            self.addCleanup(p.stop)

    def test_allowlist_omits_untracked_private_file(self):
        (self.root / "private-review-note.txt").write_text("do not ship", encoding="utf-8")
        self.assertEqual([p.relative_to(self.root).as_posix() for p in build.delivery_files()], self.file_names)

    def test_path_traversal_and_linked_file_are_rejected(self):
        for unsafe in ("../outside.txt", "plugins/quality-gate/../other.txt", "C:/private.txt", "plugins\\quality-gate\\file.txt"):
            self.manifest.write_text(json.dumps({"schemaVersion": "0.1", "files": sorted([*self.file_names, unsafe])}), encoding="utf-8")
            with self.assertRaises(RuntimeError, msg=unsafe):
                build.delivery_files()
        link = self.root / "plugins/quality-gate/link.txt"
        outside = self.root.parent / f"qgate-outside-{self.root.name}.txt"
        outside.write_text("outside", encoding="utf-8")
        self.addCleanup(outside.unlink)
        try:
            os.symlink(outside, link)
        except OSError:
            # Exercise the rejection branch even without Windows symlink privilege.
            with patch.object(Path, "is_symlink", autospec=True, side_effect=lambda item: item == link):
                self.manifest.write_text(json.dumps({"schemaVersion": "0.1", "files": sorted([*self.file_names, "plugins/quality-gate/link.txt"])}), encoding="utf-8")
                with self.assertRaisesRegex(RuntimeError, "Symlink or junction"):
                    build.delivery_files()
            return
        self.manifest.write_text(json.dumps({"schemaVersion": "0.1", "files": sorted([*self.file_names, "plugins/quality-gate/link.txt"])}), encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "Symlink or junction"):
            build.delivery_files()

    def test_test_summary_requires_complete_success(self):
        ok = "\n".join(f"ℹ {name} {number}" for name, number in [("tests", 2), ("pass", 2), ("fail", 0), ("cancelled", 0), ("skipped", 0), ("todo", 0)])
        self.assertEqual(build.test_counts(ok)["pass"], 2)
        for bad in (ok.replace("skipped 0", "skipped 1"), ok.replace("pass 2", "pass 1"), ok.replace("fail 0", "fail 1"), "ℹ tests 2\nℹ pass 2"):
            with self.assertRaises(RuntimeError):
                build.test_counts(bad)

    def test_verify_only_rejects_a_file_absent_from_git_index(self):
        files = build.delivery_files()
        indexed = "\0".join(self.file_names[:-1]) + "\0"
        with patch.object(build, "run_checked", return_value=SimpleNamespace(stdout=indexed)):
            with self.assertRaisesRegex(RuntimeError, "absent from the Git index"):
                build.assert_indexed_source(files)
        with patch.object(build, "run_checked", return_value=SimpleNamespace(stdout=indexed + self.file_names[-1] + "\0")):
            build.assert_indexed_source(files)

    def test_formal_build_requires_a_clean_committed_tree(self):
        def git(*args):
            subprocess.run(["git", *args], cwd=self.root, capture_output=True, check=True)
        git("init", "--quiet")
        git("add", ".")
        git("-c", "user.name=Delivery Test", "-c", "user.email=delivery-test@example.invalid", "commit", "--quiet", "-m", "fixture")
        files = build.delivery_files()
        build.assert_committed_source(files)
        (self.root / "private-review-note.txt").write_text("untracked and unlisted", encoding="utf-8")
        build.assert_committed_source(files)
        (self.root / self.file_names[0]).write_text("changed after commit", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "uncommitted changes"):
            build.assert_committed_source(files)

    def test_failed_validation_keeps_previous_pair(self):
        build.ARCHIVE.write_bytes(b"previous zip")
        build.SHA_FILE.write_bytes(b"previous sha")
        blobs = {name: (self.root / name).read_bytes() for name in self.file_names}
        with patch.object(build, "assert_committed_source"), patch.object(build, "committed_content", return_value=blobs), patch.object(build, "run_checked", side_effect=RuntimeError("test runner failed")):
            with self.assertRaisesRegex(RuntimeError, "test runner failed"):
                build.build()
        self.assertEqual(build.ARCHIVE.read_bytes(), b"previous zip")
        self.assertEqual(build.SHA_FILE.read_bytes(), b"previous sha")
        self.assertEqual(list(self.dist.glob(".qgate-build-*")), [])

    def test_validated_package_publishes_only_allowlisted_files(self):
        (self.root / "private-review-note.txt").write_text("do not ship", encoding="utf-8")
        counts = "\n".join(f"ℹ {name} {number}" for name, number in [("tests", 1), ("pass", 1), ("fail", 0), ("cancelled", 0), ("skipped", 0), ("todo", 0)])
        def fake_run(args, cwd):
            if "--test" in args:
                return SimpleNamespace(stdout=counts)
            return SimpleNamespace(stdout='{"status":"PASS"}')
        blobs = {name: (self.root / name).read_bytes() for name in self.file_names}
        with patch.object(build, "assert_committed_source"), patch.object(build, "committed_content", return_value=blobs), patch.object(build, "run_checked", side_effect=fake_run):
            result = build.build()
        self.assertTrue(result["published"])
        with zipfile.ZipFile(build.ARCHIVE) as archive:
            self.assertEqual(archive.namelist(), [f"quality-gate/{name}" for name in self.file_names])
            self.assertIsNone(archive.testzip())
        self.assertNotIn("private-review-note.txt", build.ARCHIVE.read_bytes().decode("latin1"))
        self.assertEqual(hashlib.sha256(build.ARCHIVE.read_bytes()).hexdigest(), build.SHA_FILE.read_text(encoding="ascii").split()[0])

    def test_formal_bytes_come_from_git_blobs_even_if_checkout_uses_other_line_endings(self):
        def git(*args):
            subprocess.run(["git", *args], cwd=self.root, capture_output=True, check=True)
        git("init", "--quiet")
        git("add", ".")
        git("-c", "user.name=Delivery Test", "-c", "user.email=delivery-test@example.invalid", "commit", "--quiet", "-m", "fixture")
        name = "plugins/quality-gate/examples/demo/README.md"
        original = (self.root / name).read_bytes()
        (self.root / name).write_bytes(b"checkout with CRLF\r\n")
        with patch.object(build, "assert_committed_source"):
            content = build.committed_content(build.delivery_files())
        self.assertEqual(content[name], original)
        self.assertNotEqual(content[name], (self.root / name).read_bytes())

    def test_publication_write_error_restores_previous_pair(self):
        build.ARCHIVE.write_bytes(b"previous zip")
        build.SHA_FILE.write_bytes(b"previous sha")
        staged_zip = self.dist / "stage.zip"
        staged_sha = self.dist / "stage.sha256"
        staged_zip.write_bytes(b"new zip")
        staged_sha.write_bytes(b"new sha")
        replace = os.replace
        def fail_sha_only(src, dst):
            if Path(src) == staged_sha:
                raise OSError("sha write failed")
            return replace(src, dst)
        with patch.object(build.os, "replace", side_effect=fail_sha_only):
            with self.assertRaisesRegex(OSError, "sha write failed"):
                build.publish(staged_zip, staged_sha)
        self.assertEqual(build.ARCHIVE.read_bytes(), b"previous zip")
        self.assertEqual(build.SHA_FILE.read_bytes(), b"previous sha")


if __name__ == "__main__":
    unittest.main()
