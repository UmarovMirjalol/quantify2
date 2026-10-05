#!/usr/bin/env bash
# Quick smoke test against a running deployment.
set -euo pipefail

BASE="${1:-http://127.0.0.1:${APP_PORT:-80}}"

echo "→ Health"
curl -fsS "$BASE/api/health" | tee /tmp/quantllm-health.json
echo

echo "→ Datasets"
curl -fsS "$BASE/api/datasets" | head -c 400
echo

echo "→ Backtest (builtin parser)"
curl -fsS -X POST "$BASE/api/backtest" \
  -H 'Content-Type: application/json' \
  -d '{
    "strategy_text": "Buy SPY when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below. Risk 1% per trade.",
    "dataset_id": "sample_data.csv",
    "config": {
      "initial_capital": 100000,
      "commission": 0.001,
      "slippage": 0.0005,
      "risk_per_trade": 0.01
    }
  }' | python3 -c 'import json,sys; r=json.load(sys.stdin); print("id", r["id"], "parser", r.get("parser"), "trades", r["metrics"]["number_of_trades"], "final", round(r["metrics"]["final_capital"],2))'

echo "✓ Smoke test passed against $BASE"
