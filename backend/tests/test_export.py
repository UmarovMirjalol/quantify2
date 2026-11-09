"""Tests for Pine Script and Python code exports."""

import pytest
from app.export.pine_generator import generate_pine_script
from app.export.python_generator import generate_python_script
from app.llm.parser import parse_builtin


def test_pine_script_export():
    parsed = parse_builtin("Buy SPY when SMA 20 crosses above SMA 50. Use 2% stop-loss and 5% take-profit.")
    pine = generate_pine_script(parsed.strategy)

    assert "//@version=5" in pine
    assert "strategy(" in pine
    assert "ta.sma(close, 20)" in pine
    assert "ta.sma(close, 50)" in pine
    assert "ta.crossover" in pine
    assert "strategy.entry" in pine
    assert "strategy.exit" in pine


def test_pine_script_price_action():
    parsed = parse_builtin("Buy on bullish pin bar with 2% stop loss and 4% take profit")
    pine = generate_pine_script(parsed.strategy)

    assert "//@version=5" in pine
    assert "is_bullish_pinbar" in pine
    assert "strategy.exit" in pine


def test_python_export():
    parsed = parse_builtin("Buy SPY when SMA 20 crosses above SMA 50")
    py_code = generate_python_script(parsed.strategy)

    assert "import pandas as pd" in py_code
    assert "def backtest" in py_code
    assert "SPEC = " in py_code
    compile(py_code, "exported.py", "exec")

