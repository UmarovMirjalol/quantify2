"""Regime split: profit above and below a causal moving average."""

from app.research.regimes import classify_regimes


def _bars(closes: list[float]) -> list[dict]:
    return [{"date": f"2024-01-{day:02d}", "close": close} for day, close in enumerate(closes, start=1)]


def test_uptrend_profit_is_separated_from_downtrend_losses():
    closes = [100.0] * 10 + [80.0] * 10 + [140.0] * 10
    trades = [
        {"entry_date": "2024-01-17", "pnl": -20.0},
        {"entry_date": "2024-01-18", "pnl": -10.0},
        {"entry_date": "2024-01-24", "pnl": 40.0},
        {"entry_date": "2024-01-25", "pnl": 15.0},
    ]
    report = classify_regimes(_bars(closes), trades, window=5)
    assert report["verdict"] == "uptrend"
    assert report["up"]["trades"] == 2
    assert report["up"]["pnl"] == 55
    assert report["down"]["pnl"] == -30


def test_thin_when_almost_no_trades_are_classifiable():
    report = classify_regimes(_bars([100.0] * 30), [{"entry_date": "2024-01-03", "pnl": 10}], window=5)
    assert report["verdict"] == "thin"
    assert report["up"]["trades"] + report["down"]["trades"] < 3
