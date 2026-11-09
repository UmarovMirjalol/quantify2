"""Expensive assets get fractional units instead of silently never trading."""

from app.backtesting.portfolio import Portfolio
from app.llm.schemas import StrategySpec
from app.risk.risk_engine import RiskEngine


def _engine() -> RiskEngine:
    return RiskEngine(
        StrategySpec.model_validate(
            {
                "asset": "BTCUSDT",
                "initial_capital": 25000,
                "entry_conditions": [
                    {"left": {"indicator": "PRICE", "component": "close"}, "operator": "greater_than", "right": 0}
                ],
                "exit_conditions": [
                    {"left": {"indicator": "PRICE", "component": "close"}, "operator": "less_than", "right": 0}
                ],
                "risk": {"risk_per_trade": 0.01},
                "commission": 0.0,
                "slippage": 0.0,
            }
        )
    )


def test_unit_priced_above_the_budget_is_bought_fractionally():
    decision = _engine().size_entry(Portfolio(initial_capital=25000), 100_000.0)
    assert decision.allowed
    assert 0 < decision.quantity < 1
    assert decision.quantity * 100_000.0 <= 25000 * 0.01 + 1e-6


def test_cheap_unit_still_sizes_in_whole_units():
    decision = _engine().size_entry(Portfolio(initial_capital=25000), 10.0)
    assert decision.allowed
    assert decision.quantity == int(decision.quantity)
