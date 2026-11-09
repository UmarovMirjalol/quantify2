"""Alpha and beta: market exposure is separated from skill."""

import numpy as np

from app.research.market import market_exposure


def _market(n: int = 300, seed: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return 100 * np.cumprod(1 + rng.normal(0.0005, 0.01, n))


def test_holding_the_asset_is_pure_beta_with_no_alpha():
    px = _market()
    report = market_exposure(px * 1000, px)
    assert abs(report["beta"] - 1.0) < 1e-6
    assert abs(report["alpha_annual"]) < 1e-6
    assert report["r_squared"] > 0.99
    assert report["verdict"] in {"beta", "no_edge"}


def test_half_exposure_halves_beta():
    px = _market()
    rm = px[1:] / px[:-1] - 1
    equity = 1000 * np.concatenate([[1.0], np.cumprod(1 + 0.5 * rm)])
    report = market_exposure(equity, px)
    assert abs(report["beta"] - 0.5) < 1e-6


def test_steady_independent_return_is_alpha():
    px = _market()
    rng = np.random.default_rng(7)
    equity = 1000 * np.cumprod(1 + rng.normal(0.002, 0.002, len(px)))
    report = market_exposure(equity, px)
    assert report["verdict"] == "alpha"
    assert report["alpha_annual"] > 0.2
    assert abs(report["beta"]) < 0.2


def test_short_history_is_thin():
    px = _market(10)
    assert market_exposure(px, px)["verdict"] == "thin"
