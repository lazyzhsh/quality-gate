#!/usr/bin/env python3
"""qgate symbol-grounding Python import 参考 适配器（v1.20 轨道 C，OD-104/OD-111）。

用法:
    python adapters/python/import_probe.py --output .quality-gate/observations/imports-python.json src/**/*.py
    python adapters/python/import_probe.py --normalize-openapi docs/openapi.yaml .quality-gate/normalized/openapi.json

import 模式:
- 按与内核 lib/symbol-grounding.mjs 相同的语句锚定词法规则提取 import 说明符（# 注释剥离、
  字符串内容掩码——适配器与内核各自实现同一规则，内核以"恰好覆盖"双向对账核验本回报）;
- 每个说明符以运行中解释器 importlib.util.find_spec 探测（pip 包名与模块名不同构，探测才是
  真对账; venv 边界如实=以运行本脚本的解释器环境为准）: stdlib（sys.stdlib_module_names）/
  third-party（site-packages）/ project（origin 落在项目根内）/ unresolved（含相对导入的
  文件系统解析）;
- 产出观察文件 {schemaVersion:'0.1', language:'python', tool, entries[{module,resolution,detail?}]}，
  module 为源码字面说明符（相对导入含点前缀原样）——供 symbol-grounding importObservations 消费。

--normalize-openapi 模式（OD-110）: YAML OpenAPI 归一为 JSON 声明面（pyyaml; 缺失时 stderr 给出
安装指引并以非零退出）。本适配器恒以退出码 0 结束 import 模式（观察协议: 解析失败以 entries 的
unresolved 表达，不由退出码表达）。
"""
import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

IMPORT_RE = re.compile(r'(?:^|[\n;])[ \t]*import\s+([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*)')
FROM_RE = re.compile(r'(?:^|[\n;])[ \t]*from\s+([A-Za-z_.][\w.]*)\s+import\b')


def prepare(source: str) -> str:
    """镜像内核 preparePythonSource：# 注释剥离 + 字符串内容替换为空白（保留长度与换行）。"""
    out = []
    quote = None
    index = 0
    while index < len(source):
        char = source[index]
        if quote:
            if char == '\\' and index + 1 < len(source):
                out.append('  ')
                index += 2
                continue
            out.append(char if char == quote or char == '\n' else ' ')
            if char == quote:
                quote = None
            index += 1
            continue
        if char in '"\'':
            quote = char
            out.append(char)
            index += 1
            continue
        if char == '#':
            while index < len(source) and source[index] != '\n':
                index += 1
            continue
        out.append(char)
        index += 1
    return ''.join(out)


def extract(code: str):
    modules = []
    for match in IMPORT_RE.finditer(code):
        modules.extend(part.strip() for part in match.group(1).split(',') if part.strip())
    for match in FROM_RE.finditer(code):
        modules.append(match.group(1))
    return modules


def resolve_relative(module: str, importer: Path, root: Path):
    stripped = module.lstrip('.')
    level = len(module) - len(stripped)
    base = importer.parent
    for _ in range(level - 1):
        base = base.parent
    target = base.joinpath(*stripped.split('.')) if stripped else base
    exists = target.with_suffix('.py').is_file() or (target.is_dir() and (target / '__init__.py').is_file())
    return ('project' if exists else 'unresolved',
            f'relative import {"resolves" if exists else "does not resolve"} under {base.relative_to(root) if root in base.parents or base == root else base}')


def classify(module: str, importer: Path, root: Path):
    if module.startswith('.'):
        return resolve_relative(module, importer, root)
    if module.split('.')[0] in sys.stdlib_module_names:
        return 'stdlib', f'stdlib of CPython {sys.version_info.major}.{sys.version_info.minor}'
    try:
        spec = importlib.util.find_spec(module)
    except (ImportError, ModuleNotFoundError, ValueError):
        spec = None
    if spec is None:
        return 'unresolved', f'ModuleNotFoundError: No module named {module!r}'
    if spec.origin:
        location = Path(spec.origin).resolve()
        if location == root or root in location.parents:
            return 'project', f'find_spec origin inside project: {spec.origin}'
        return 'third-party', f'find_spec origin: {spec.origin}'
    if spec.submodule_search_locations:
        return 'third-party', 'namespace package (no single origin)'
    return 'unresolved', f'find_spec returned no origin for {module!r}'


def main() -> int:
    parser = argparse.ArgumentParser(description='qgate python import reference adapter')
    parser.add_argument('--output', help='observation json path to write')
    parser.add_argument('--normalize-openapi', nargs=2, metavar=('SRC', 'DST'), help='normalize an OpenAPI YAML file to JSON')
    parser.add_argument('files', nargs='*', help='python source files to probe')
    args = parser.parse_args()

    if args.normalize_openapi:
        try:
            import yaml  # noqa: F401
        except ImportError:
            print('pyyaml is required for OpenAPI YAML normalization: pip install pyyaml', file=sys.stderr)
            return 1
        import yaml
        src, dst = args.normalize_openapi
        document = yaml.safe_load(Path(src).read_text(encoding='utf-8'))
        destination = Path(dst)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'normalized {src} -> {dst}')
        return 0

    if not args.files:
        print('no python files given; nothing to probe', file=sys.stderr)
        return 1
    root = Path.cwd().resolve()
    seen = {}
    for raw in args.files:
        file_path = Path(raw).resolve()
        modules = extract(prepare(file_path.read_text(encoding='utf-8')))
        for module in modules:
            if module in seen:
                continue
            resolution, detail = classify(module, file_path, root)
            seen[module] = {'module': module, 'resolution': resolution, 'detail': detail}
    observation = {
        'schemaVersion': '0.1',
        'language': 'python',
        'tool': 'adapters/python/import_probe.py',
        'entries': [seen[key] for key in sorted(seen)],
    }
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(observation, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'wrote {len(seen)} entries to {args.output}')
    else:
        print(json.dumps(observation, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
