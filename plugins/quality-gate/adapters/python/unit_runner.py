#!/usr/bin/env python3
"""qgate engineering unit 参考 runner（pytest 形态，E7）。

用法（engineering unit check 的 argv）:
    ["python", "adapters/python/unit_runner.py", "tests/"]

协议:
- stdin 收 qgate 请求 {"schemaVersion":"0.1","runId":...,"checkId":...}，观察 JSON 回显 runId;
- 本地执行 pytest --junitxml=build/qgate-junit.xml（位置参数 = pytest 测试路径）;
- 从 XML 的 testsuite 属性求和自报计数, 并声明 rawOutput 指向该文件——内核(B1)会独立解析
  同一文件重算计数并与本 runner 自报交叉核验;
- 本 runner 恒以退出码 0 结束(观察协议: 测试失败由内核按计数判定, 不由退出码表达)。
"""
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def main() -> int:
    request = json.loads(sys.stdin.read())
    targets = sys.argv[1:] or ["tests"]
    xml_path = Path("build") / "qgate-junit.xml"
    xml_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, "-m", "pytest", "--junitxml", str(xml_path), *targets],
        capture_output=True,
    )
    root = ET.parse(xml_path).getroot()
    total = failures = errors = skipped = 0
    for suite in root.iter("testsuite"):
        total += int(suite.get("tests", 0))
        failures += int(suite.get("failures", 0))
        errors += int(suite.get("errors", 0))
        skipped += int(suite.get("skipped", 0))
    print(json.dumps({
        "schemaVersion": "0.1",
        "runId": request["runId"],
        "source": "adapters/python/unit_runner.py (pytest junitxml)",
        "total": total,
        "passed": total - failures - errors - skipped,
        "failed": failures + errors,
        "skipped": skipped,
        "rawOutput": {"format": "junit", "file": xml_path.as_posix()},
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
