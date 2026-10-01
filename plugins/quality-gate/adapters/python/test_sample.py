"""参考测试套件（与 engineering-demo/test_sample 四用例同构：2 过 / 1 跳 / 1 败）。

供 adapters 集成测试与接入演示使用；接入真实项目时替换为你自己的测试路径。
"""
import pytest


def test_fee_standard():
    assert 1 + 1 == 2


def test_fee_large():
    assert 2 * 3 == 6


@pytest.mark.skip(reason="legacy baseline only")
def test_legacy_rounding():
    assert True


def test_cap_enforcement():
    assert 3 * 3 == 10
