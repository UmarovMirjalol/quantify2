import numpy as np
import pandas as pd

from app.backtesting.engine import BacktestEngine
from app.export import standalone_engine
from app.export.pine_generator import generate_pine_script
from app.llm.clauses import parse_side, split_sides
from app.llm.parser import parse_builtin
from app.strategies.interpreter import generate_signals


def _bars(n=400, seed=3):
    rng = np.random.default_rng(seed)
    close = 100 * np.exp(np.cumsum(rng.normal(0.0004, 0.015, n)))
    open_ = close * (1 + rng.normal(0, 0.003, n))
    return pd.DataFrame(
        {
            "date": pd.date_range("2020-01-01", periods=n, freq="D").astype(str),
            "open": open_,
            "high": np.maximum(open_, close) * 1.004,
            "low": np.minimum(open_, close) * 0.996,
            "close": close,
            "volume": rng.integers(1_000, 5_000, n).astype(float),
        }
    )


def test_split_sides_and_nested_group():
    entry, exit_ = split_sides(
        "Buy NVDA when RSI(14) < 35 and (MACD crosses above signal or the price drops 4% in a day). "
        "Sell when RSI > 65 or price falls below the 50-day SMA. Stop loss 5%."
    )
    conds, logic, any_of = parse_side(entry)
    assert logic == "AND" and len(conds) == 1 and len(any_of) == 2
    assert any_of[1]["left"]["indicator"] == "CHANGE" and any_of[1]["right"] == -4.0
    conds, logic, any_of = parse_side(exit_)
    assert logic == "OR" and len(conds) == 2 and not any_of


def test_parser_keeps_every_filter():
    s = parse_builtin(
        "Buy SPY when RSI is below 30 and the price is above the 200-day SMA. Sell when RSI rises above 70."
    ).strategy
    assert [c.left.indicator.value for c in s.entry_conditions] == ["RSI", "PRICE"]
    assert s.entry_conditions[1].right.period == 200
    assert s.exit_conditions[0].right == 70.0


def test_unclear_clause_falls_back_to_templates():
    s = parse_builtin("Short SPY when the 20-day SMA crosses below the 50-day SMA, cover when it crosses back above.").strategy
    assert s.exit_conditions[0].operator.value == "cross_above"
    assert s.exit_conditions[0].left.indicator.value == "SMA"


def test_rises_without_window_stays_a_take_profit():
    s = parse_builtin("Buy SPY when the price drops 3% in a day, sell when it rises 5%").strategy
    assert s.take_profit == 0.05


def test_any_group_matches_export_and_pine():
    df = _bars()
    s = parse_builtin(
        "Buy when RSI below 45 and (price is above the 20-day SMA or MACD crosses above signal). "
        "Sell when RSI above 60."
    ).strategy
    assert len(s.entry_any) == 2
    entry, _ = generate_signals(df, s)
    only_rsi = parse_builtin("Buy when RSI below 45. Sell when RSI above 60.").strategy
    assert entry.sum() < generate_signals(df, only_rsi)[0].sum()
    assert " and ((close > sma_20) or ta.crossover(macd_macd, macd_signal))" in generate_pine_script(s)


def test_funding_cost_matches_export():
    df = _bars()
    s = parse_builtin("Buy when the price is above the 20-day SMA. Sell when the price is below the 20-day SMA.").strategy
    s = s.model_copy(update={"funding_rate": 0.2, "commission": 0.001, "slippage": 0.0005})
    paid = BacktestEngine(s).run(df)
    free = BacktestEngine(s.model_copy(update={"funding_rate": 0.0})).run(df)
    assert paid["total_funding"] > 0
    assert paid["equity_curve"][-1]["equity"] < free["equity_curve"][-1]["equity"]
    entry, exit_ = generate_signals(df, s)
    _, eq = standalone_engine.backtest(df, s.model_dump(mode="json"), entry.to_numpy(), exit_.to_numpy())
    assert abs(eq[-1] - paid["equity_curve"][-1]["equity"]) < 1e-6


def test_parser_reads_funding_and_scale_in():
    s = parse_builtin(
        "Buy BTC when RSI below 30, sell when RSI above 70. Funding 0.01% per 8 hours. Buy in 3 parts."
    ).strategy
    assert abs(s.funding_rate - 0.0001 * 3 * 365) < 1e-9
    assert s.max_entries == 3


def test_trades_say_why():
    df = _bars()
    s = parse_builtin("Buy when RSI below 40. Sell when RSI above 60. Stop loss 3%.").strategy
    trades = BacktestEngine(s).run(df)["trades"]
    assert trades
    assert all(t["entry_why"].startswith("RSI(14)") and "below 40.00" in t["entry_why"] for t in trades)
    reasons = {t["exit_why"].split(" ")[0] for t in trades}
    assert reasons <= {"RSI(14)", "Stop-loss"}
