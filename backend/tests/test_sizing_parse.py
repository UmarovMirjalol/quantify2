"""Plain-language position sizing in the built-in parser."""

import pytest

from app.llm.parser import parse_builtin
from app.llm.schemas import PositionSizing

RULES = "Buy when RSI(14) < 30, sell when RSI > 70"


@pytest.mark.parametrize(
    ("suffix", "fraction"),
    [
        ("", 1.0),
        (". Use 100% of capital.", 1.0),
        (", all-in", 1.0),
        (", invest 50% of my capital", 0.5),
        (", position size 25%", 0.25),
        (". Risk 1% per trade.", 1.0),
    ],
)
def test_without_a_stop_trades_a_share_of_capital(suffix, fraction):
    s = parse_builtin(RULES + suffix, risk_per_trade=0.01).strategy
    assert s.position_sizing == PositionSizing.PERCENT_CAPITAL
    assert s.risk.percent_capital == pytest.approx(fraction)


def test_stop_with_no_size_phrase_keeps_risk_sizing():
    s = parse_builtin(RULES + ", stop-loss 2%, risk 1% per trade", risk_per_trade=0.01).strategy
    assert s.position_sizing == PositionSizing.RISK_BASED
    assert s.stop_loss == pytest.approx(0.02)


def test_explicit_size_wins_over_stop():
    s = parse_builtin(RULES + ", stop-loss 2%, use 100% of capital", risk_per_trade=0.01).strategy
    assert s.position_sizing == PositionSizing.PERCENT_CAPITAL
    assert s.risk.percent_capital == pytest.approx(1.0)


def test_hints_follow_the_strategy_language():
    en = parse_builtin(RULES, risk_per_trade=0.01).clarifications
    ru = parse_builtin("Покупай когда RSI(14) ниже 30, продавай выше 70", risk_per_trade=0.01).clarifications
    assert en and all(not any("а" <= ch <= "я" for ch in c.lower()) for c in en)
    assert ru and any("капитала" in c for c in ru)
