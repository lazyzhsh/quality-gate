"""Sync the ZCode client marketplace snapshot for quality-gate and verify install state.

Directory-type marketplaces support the update button. The client copies from
its whole-repository marketplace snapshot, so synchronize this snapshot before
using Update on the Quality Gate plugin row. Verification uses cached manifests
and file hashes, without changing the installation cache directly.

Windows-only (robocopy). Run from the repository root after a release build.
"""
import hashlib
import json
import os
import pathlib
import subprocess
import sys

HOME = pathlib.Path(os.environ.get("USERPROFILE", pathlib.Path.home()))
MARKETPLACE_ID = "quality-gate-local"
PLUGIN_NAME = "quality-gate"
CLIENT_PLUGINS = HOME / ".zcode" / "cli" / "plugins"
SNAPSHOT = CLIENT_PLUGINS / "marketplaces" / MARKETPLACE_ID
CACHE = CLIENT_PLUGINS / "cache" / MARKETPLACE_ID / PLUGIN_NAME
REGISTRY = CLIENT_PLUGINS / "known_marketplaces.json"
REPO = pathlib.Path(__file__).resolve().parent.parent


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def version_of(path):
    manifest = path / "marketplace.json"
    if not manifest.is_file():
        return None
    return json.loads(manifest.read_text(encoding="utf-8"))["plugins"][0]["version"]


def main():
    repo_version = version_of(REPO)
    print(f"repo version:      {repo_version}")

    registry = json.loads(REGISTRY.read_text(encoding="utf8")) if REGISTRY.is_file() else {}
    entry = next((m for m in registry.get("marketplaces", []) if m.get("id") == MARKETPLACE_ID), None)
    if entry is None:
        sys.exit(f"marketplace {MARKETPLACE_ID!r} not registered in the client; add it once in the client UI")
    registered = entry.get("source", {}).get("path")
    print(f"registered source: {registered}")
    if registered and os.path.normcase(registered) != os.path.normcase(str(REPO)):
        print("WARNING: registered source differs from this repository; client may be pointed elsewhere")

    snapshot_version = version_of(SNAPSHOT)
    print(f"snapshot version:  {snapshot_version}")

    if snapshot_version != repo_version:
        print("snapshot version differs -> re-mirroring")
    else:
        # v1.14 验收发现：版本号相同但内容不同（如同版本内仅改 README 后重建）时，仅比对
        # 版本会漏镜像，"更新"按钮随后把旧内容装进缓存。robocopy 自身按文件增量跳过，
        # 无条件镜像代价约一秒，且比任何内容哈希启发式更不会漏。
        print("snapshot version matches; mirroring anyway to pick up same-version content changes")
    result = subprocess.run(
        ["robocopy", str(REPO), str(SNAPSHOT), "/MIR", "/NFL", "/NDL", "/NJH", "/NP", "/NS", "/NC"],
        capture_output=True, text=True, encoding="gbk", errors="replace",
    )
    if result.returncode >= 8:
        sys.exit(f"robocopy failed (exit {result.returncode}):\n{result.stdout[-2000:]}")
    print(f"snapshot re-mirrored -> {version_of(SNAPSHOT)} (robocopy exit {result.returncode})")

    versions = sorted(p.name for p in CACHE.iterdir() if p.is_dir()) if CACHE.is_dir() else []
    print(f"cache versions:    {versions or 'none (plugin not installed)'}")
    cache_current = [v for v in versions if v == repo_version]
    if not cache_current:
        print("\nNEXT (2026-09-27 起，版本升级走更新按钮): 客户端插件市场 -> Quality Gate 行 -> 更新（仅有的必要 UI 动作）")
        print("     （行内无更新按钮时的回退：行 '...' -> 卸载 -> 确认 -> 插件市场页个人页签 -> 安装）")
    else:
        src = REPO / "plugins" / "quality-gate"
        installed = CACHE / repo_version
        a = {str(p.relative_to(installed)).replace(os.sep, "/"): sha(p)
             for p in installed.rglob("*") if p.is_file()}
        b = {str(p.relative_to(src)).replace(os.sep, "/"): sha(p)
             for p in src.rglob("*") if p.is_file()}
        diff = [k for k in set(a) | set(b) if a.get(k) != b.get(k)]
        print(f"cache {repo_version} vs source: {len(a)} files, {'SHA-identical' if not diff else f'{len(diff)} DIFFER: {diff[:5]}'}")
        if diff:
            # v1.14 验收先例：同版本内容刷新走卸载→重装（更新按钮只做版本升级）
            print("\nNEXT (同版本内容刷新): 客户端插件市场 -> Quality Gate 行 '...' -> 卸载 -> 确认 -> 插件市场页个人页签 -> 安装，然后重跑本脚本确认 SHA-identical")


if __name__ == "__main__":
    main()
