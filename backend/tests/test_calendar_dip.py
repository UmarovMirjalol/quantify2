"""Calendar ("buy on Monday") and buy-the-dip rules, plus fills after a gap up."""

import numpy as np
import pandas as pd
import pytest

from app.backtesting.engine import BacktestEngine
from app.backtesting.indicators import compute_indicator_series
from app.export.pine_generator import generate_pine_script
from app.llm.parser import parse_builtin
from app.llm.schemas import StrategySpec


def _bars(n: int = 60, start: str = "2024-01-01", freq: str = "B", closes: list[float] | None = None) -> pd.DataFrame:
    dates = pd.date_range(start, periods=n, freq=freq)
    close = np.array(closes if closes is not None else [100.0 + i for i in range(n)], dtype=float)
    return pd.DataFrame(
        {"date": dates.strftime("%Y-%m-%d"), "open": close, "high": close * 1.01, "low": close * 0.99, "close": close, "volume": 1_000}
    )


def test_next_weekday_wraps_friday_to_monday_for_stocks():
    df = _bars(10)
    nxt = compute_indicator_series(df, "WEEKDAY", component="next").tolist()
    today = compute_indicator_series(df, "WEEKDAY").tolist()
    assert today[:5] == [0, 1, 2, 3, 4]
    assert nxt[:5] == [1, 2, 3, 4, 0]


def test_next_weekday_keeps_weekends_for_crypto():
    df = _bars(8, freq="D")
    nxt = compute_indicator_series(df, "WEEKDAY", component="next").tolist()
    assert nxt[4] == 5  # Friday -> Saturday when weekend bars exist


@pytest.mark.parametrize(
    ("text", "day_in", "day_out"),
    [
        ("Buy SPY on Monday and sell on Friday", 0, 4),
        ("Покупай в понедельник, продавай в пятницу", 0, 4),
        ("Buy on Friday", 4, 0),
    ],
)
def test_calendar_phrases(text, day_in, day_out):
    s = parse_builtin(text).strategy
    assert s.entry_conditions[0].left.indicator.value == "WEEKDAY"
    assert s.entry_conditions[0].right == day_in
    assert s.exit_conditions[0].right == day_out


def test_monday_to_friday_trades_every_week_at_the_open():
    s = parse_builtin("Buy on Monday and sell on Friday", initial_capital=10_000).strategy
    out = BacktestEngine(s).run(_bars(40))
    entries = {pd.Timestamp(t["entry_date"]).dayofweek for t in out["trades"]}
    exits = {pd.Timestamp(t["exit_date"]).dayofweek for t in out["trades"]}
    assert entries == {0} and exits == {4}
    assert len(out["trades"]) >= 6


@pytest.mark.parametrize(
    ("text", "bars", "drop", "take"),
    [
        ("Buy when the price drops 5% in a day", 1, -5.0, None),
        ("Buy after a 10% drop in a week, sell when it rises 8%", 5, -10.0, 0.08),
        ("Купи когда цена упадет на 3% за день", 1, -3.0, None),
    ],
)
def test_dip_phrases(text, bars, drop, take):
    r = parse_builtin(text)
    cond = r.strategy.entry_conditions[0]
    assert cond.left.indicator.value == "CHANGE"
    assert cond.left.period == bars
    assert cond.right == drop
    assert r.strategy.take_profit == take


def test_rule_keywords_still_win_over_calendar_and_dip():
    s = parse_builtin("Buy when RSI drops below 30 on Monday").strategy
    assert s.entry_conditions[0].left.indicator.value == "RSI"


def test_pine_export_defines_new_series():
    pine = generate_pine_script(parse_builtin("Buy on Monday and sell on Friday").strategy)
    assert "dow_next =" in pine and "(dow_next == 0.0)" in pine
    pine = generate_pine_script(parse_builtin("Buy when the price drops 5% in a day").strategy)
    assert "chg_1 = (close / close[1] - 1) * 100" in pine


def test_full_size_entry_still_fills_after_a_gap_up():
    closes = [100.0] * 10
    closes[6] = 120.0
    df = _bars(10, closes=closes)
    df.loc[1, "open"] = 110.0
    close = {"indicator": "PRICE", "component": "close"}
    s = StrategySpec.model_validate(
        {
            "initial_capital": 10_000,
            "entry_conditions": [{"left": close, "operator": "greater_than", "right": 0}],
            "exit_conditions": [{"left": close, "operator": "greater_than", "right": 115}],
            "position_sizing": "percent_capital",
            "risk": {"percent_capital": 1.0},
        }
    )
    trades = BacktestEngine(s).run(df)["trades"]
    assert trades, "the gap up must not silently skip the entry"
    first = trades[0]
    assert first["entry_price"] == pytest.approx(110.0)
    assert first["quantity"] == 90
    assert first["quantity"] * first["entry_price"] <= 10_000
