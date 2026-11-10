"""The engine must produce the same trades as backtrader, an independent backtester."""

from pathlib import Path

import pandas as pd
import pytest

pytest.importorskip("backtrader")

from scripts.verify_against_backtrader import _backtrader, _cases, _quantify, _same  # noqa: E402

SAMPLE = Path(__file__).resolve().parents[1] / "data" / "sample_data.csv"


@pytest.mark.parametrize("case", _cases(), ids=lambda c: c[0])
def test_trades_match_backtrader(case):
    name, kind, args, entry, exit_ = case
    df = pd.read_csv(SAMPLE)
    q, b = _quantify(df, entry, exit_), _backtrader(df, kind, args)
    assert len(q["trades"]) == len(b["trades"])
    assert all(_same(x, y) for x, y in zip(q["trades"], b["trades"]))
    assert q["final_equity"] == pytest.approx(b["final_equity"], rel=1e-9)
