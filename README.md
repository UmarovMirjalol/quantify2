# Quantify

AI-powered quantitative research platform. Describe a trading strategy in plain English, convert it into executable logic, run a look-ahead-safe backtest, and inspect institutional-grade metrics, charts, and trade history.

> **Sample dataset:** `data/sample_data.csv` is synthetic OHLCV for local development and tests. Upload your own market CSV for research. Do not treat synthetic results as live market performance.

## Features

- Natural-language strategy input with a **built-in parser** (works offline) and optional OpenAI-compatible LLM
- Strict Pydantic strategy specifications — no arbitrary code execution
- Custom bar-by-bar backtesting engine
- Risk engine: position sizing, stops, exposure, cash, leverage, costs, slippage
- CSV upload with validation
- Full performance metrics (Sharpe, Sortino, CAGR, max drawdown, profit factor, …)
- Equity / drawdown / price-with-markers charts
- SQLite backtest history
- Live landing counters (users / backtests / releases) that update as people visit and run tests

## Architecture

```
Natural language
  → Built-in parser or LLM
  → StrategySpec (Pydantic)
  → validation
  → signal generation (causal indicators)
  → BacktestEngine (signal at close → execute next open)
  → RiskEngine (sizing, stops, costs)
  → metrics + charts + SQLite persistence
```

| Layer | Stack |
|-------|--------|
| Backend | Python 3.12, FastAPI, Pydantic, pandas, NumPy, SQLAlchemy/SQLite |
| Frontend | React, TypeScript, Vite, Plotly |
| NLP | Built-in deterministic parser + optional OpenAI-compatible API |

## Backtesting methodology

**Execution convention (look-ahead bias prevention):**

1. Indicators and signals at bar `t` use only data available at or before the close of bar `t`.
2. A signal at the close of bar `t` executes at the **open of bar `t+1`**.
3. Stop-loss / take-profit use high/low on the fill bar. If both could be hit, the engine assumes the stop is hit first (conservative), unless the open gaps through take-profit without trading through the stop.

Commission is a fraction of fill notional. Slippage worsens the fill (higher for buys, lower for sells).

## Supported strategy components

**Indicators:** SMA, EMA, RSI, MACD, Bollinger Bands, ATR, PRICE  

**Conditions:** greater_than, less_than, cross_above, cross_below, equals  

**Logic:** AND / OR  

**Risk:** fixed shares, % of capital, risk-per-trade sizing, stop-loss, take-profit, max position %, max exposure, leverage, commission, slippage  

Long-only in this release; short-selling can extend `PositionSide.SHORT`.

## Project structure

```
backend/app/          # FastAPI, parsers, engine, risk, metrics, models
backend/tests/
frontend/src/         # React UI
data/sample_data.csv
uploads/              # runtime CSV uploads
docker-compose.yml
.env.example
```

## Installation

### Prerequisites

- Python 3.11+
- Node.js 20+
- Optional: OpenAI-compatible API key for broader NLP

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env
```

### Frontend

```bash
cd frontend
npm install
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `LLM_API_KEY` | Optional. Enables LLM parsing when set |
| `LLM_MODEL` | Model name (default `gpt-4o-mini`) |
| `LLM_BASE_URL` | OpenAI-compatible base URL |
| `DATABASE_URL` | SQLAlchemy URL (default SQLite) |
| `CORS_ORIGINS` | Allowed frontend origins |
| `FORCE_BUILTIN_PARSER` | Force built-in parser even if a key is set |

Never commit real secrets. `.env` is gitignored.

## Run

### Production (Docker) — ready for users

```bash
cp .env.production.example .env
# recommended: LLM_API_KEY=sk-...

./deploy/scripts/deploy.sh
# prints APP_ACCESS_TOKEN — share it with users
```

Users open the URL → enter the access token → run backtests.  
HTTPS: see [DEPLOY.md](DEPLOY.md).

### Backend (local, port 8765)

```bash
cd backend
export PYTHONPATH=.
uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

API docs: http://127.0.0.1:8765/docs

### Frontend (local, port 43127)

```bash
cd frontend
npm run dev
```

Open via **Cursor → Ports** (not laptop Chrome): http://127.0.0.1:43127

```bash
./scripts/start-dev.sh
```

### Production preview (no Docker)

```bash
cd frontend && npm ci && npm run build
# backend already on :8765
node ../scripts/serve-prod.mjs 18080
```

Open http://127.0.0.1:18080 via Cursor Ports.

### Docker Compose (dev overlay)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
## Built-in parser vs LLM

Quantify is designed around an **LLM interpretation layer**:

```
natural language → LLM (OpenAI-compatible) → StrategySpec (Pydantic) → engine
```

1. Open **LLM** in the UI (`/settings`) and paste an API key, **or** set env vars:
   ```bash
   LLM_API_KEY=sk-...
   LLM_MODEL=gpt-4o-mini
   LLM_BASE_URL=https://api.openai.com/v1
   ```
2. Any OpenAI-compatible provider works (OpenAI, Groq, Together, Azure, local gateways).
3. Model output is **JSON only**, validated with Pydantic. **No generated code is executed.**
4. If the LLM fails or no key is set, the **built-in parser** still runs supported strategies.

Runtime keys from the UI are stored server-side in `.llm_runtime.json` (gitignored). Prefer env vars in production.

API:

- `GET /api/llm/status` — enabled flag, model, masked key
- `PUT /api/llm/config` — save key / model / base_url
- `DELETE /api/llm/config` — clear runtime config
- `POST /api/parse-strategy` — uses LLM when enabled

## Uploading data

Required columns:

```text
date,open,high,low,close,volume
```

```bash
curl -F "file=@my_data.csv" http://127.0.0.1:8765/api/data/upload
```

## Example strategies

```text
Buy SPY when the 20-day SMA crosses above the 50-day SMA and sell when the 20-day SMA crosses below the 50-day SMA. Risk 1% per trade.
```

```text
Buy when RSI falls below 30 and sell when RSI rises above 70.
```

```text
Buy when the 12-day EMA crosses above the 26-day EMA and sell when it crosses below. Use a 2% stop-loss and 5% take-profit.
```

```text
Buy when price closes below the lower Bollinger Band and sell when it crosses above the middle band.
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Status + active parser |
| POST | `/api/parse-strategy` | NL → StrategySpec |
| POST | `/api/backtest` | Parse + run + save |
| GET | `/api/backtests` | History |
| GET | `/api/backtests/{id}` | Full result |
| POST | `/api/data/upload` | Upload CSV |
| GET | `/api/datasets` | List datasets |

## Tests

```bash
cd backend
export PYTHONPATH=.
pytest -q
```

## Limitations

- Long-only (no short selling yet)
- Single-asset per run
- Integer share sizing
- Built-in parser covers common quant phrasings; LLM expands coverage
- Conservative same-bar stop/take assumption
- Sample CSV is synthetic

## License

MIT
