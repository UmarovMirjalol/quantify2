# Quantify

**Your edge — proven before you risk a dollar.** Type a trading strategy in plain English. Quantify runs a look-ahead-safe backtest with next-open fills, costs, Sharpe / drawdown, and a full trade blotter. Free. No signup.

> **Sample dataset:** `data/sample_data.csv` is synthetic OHLCV for local development and tests. Upload your own market CSV for research. Do not treat synthetic results as live market performance.

## Features

- Natural-language strategy input with a **built-in parser** (works offline) and optional OpenAI-compatible LLM
- Strict Pydantic strategy specifications; LLM output is validated JSON, never executed
- **Python strategies** (`/code`): write `strategy(df)` returning entry, exit and an optional per-entry size. Runs in a sandboxed child process through the same engine and every overfitting check; a look-ahead guard rejects code whose past signals change when future bars are removed
- **Standalone export**: any run downloads as one `.py` file (numpy + pandas only) that reproduces the site's trades on your CSV, tested to match the engine exactly
- **Export everything**: trades CSV, equity CSV, result JSON per run, and the full history as one JSON archive
- **Position management**: trailing stop, up to three partial take-profits, stop-to-breakeven after the first partial exit, and pyramiding (up to 10 entries into one position). Set them in the form or just write "trailing stop 3%, take half at 5%, pyramid up to 3"; Pine and standalone Python exports reproduce them
- **Long history**: one-click market data for 1, 5 or 10 years, or the full history (SPY daily back to 1993, BTC to 2014); 10 years by default
- **Signal today**: every run ends with what the rules say now (flat or in a position, entry price, open P&L, stop/target, and the order for the next open); live-market runs refresh it with the latest bars in one click
- **Screener** (`/screener`): run one rule across up to 40 tickers (US mega caps, ETFs, crypto or your own list) and see who gets a Buy/Sell at the next open today, ranked with Sharpe, return vs buy & hold and drawdown; one click backtests or tracks any row
- **Discover** (`/discover`): tries 30 classic rule sets (MA crosses, Donchian, MACD, ADX, RSI, Bollinger, Stochastic) on an asset, ranks them on the first 70% of history only and shows which held up on the unseen 30%, with a Deflated-Sharpe luck check
- **Forward tests** (`/forward`): freeze a strategy today and score it only on bars that arrive afterwards (paper trading); start from text, any live-market backtest or a screener row, compare with buy & hold and the backtest's CAGR
- **Tools** (`/tools`): position size from stop distance, break-even win rate and expectancy for a reward:risk, Kelly fraction, drawdown recovery and compound growth
- **More indicators**: Stochastic %K/%D, ADX and +DI/−DI, Donchian/turtle breakouts, all in plain English or Russian ("turtle breakout 55 days", "ADX above 25", "стохастик ниже 20"), exported to Pine (`ta.stoch`, `ta.dmi`, `ta.highest`) and standalone Python
- **Accounts** (optional, username + password, no email): history follows you to any browser or device; runs you made before signing up move into the account
- Custom bar-by-bar backtesting engine
- Risk engine: position sizing, stops, exposure, cash, leverage, costs, slippage
- CSV upload with validation
- Full performance metrics (Sharpe, Sortino, CAGR, max drawdown, profit factor, …)
- Equity / drawdown / price-with-markers charts
- Holdout audit: same rules on the unseen last 30% of bars, plus a nearby-parameter Sharpe check
- Regime split: trade profit above and below a causal moving average
- Walk-forward: refit the entry parameter on past bars and score only the next unseen slice
- Deflated Sharpe (Bailey & López de Prado): discounts the Sharpe for how many variants this browser tried on the same data
- Cost break-even: the per-side cost at which total return turns non-positive
- Parameter heatmap: Sharpe across every fast × slow crossover pair, with a plateau-or-peak verdict
- Unified verdict: holdout, walk-forward, synthetic markets, Deflated Sharpe, costs, heatmap, regimes, alpha, and Monte Carlo graded into one 0–100 score; a failure on unseen data caps the grade
- Synthetic markets: 100 block-bootstrapped alternate histories (scaled down to 40 on multi-decade data to keep the verdict fast) of the asset (20-bar blocks), with the share of paths that pay and where the real history ranks
- No-peek optimizer: grid-search the entry parameters (crossover fast × slow, oscillator period × threshold, or a single period) on the first 70% only, judge the winner once on the last 30%, and deflate its Sharpe for the number of candidates; the tuned setting can be rerun in one click
- Portfolio: one rule set on up to 12 assets (samples, uploads, or tickers fetched live) with equal-capital sleeves, an equal-weight buy-and-hold benchmark, per-asset contribution, a sleeve correlation matrix, and the diversification ratio
- Alpha & beta vs buy-and-hold of the same asset: per-bar regression with alpha t-stat, R², and up/down capture
- Short selling: "Short SPY when…" opens a real short (cash credit, mirrored stops, cover P&L), exported to Pine as `strategy.short`
- Compare two runs: equity rebased to one start, every metric and check side by side, winner highlighted
- Public report link (read-only, revocable, no account needed) and print-ready PDF
- Engine loop runs on NumPy arrays (~90× faster than row-wise pandas), which keeps grid sweeps interactive
- SQLite backtest history
- Live landing counters (users / backtests / releases) that update as people visit and run tests
- Strategy playbook gallery with deep-links into the workspace
- Public research pulse (anonymized recent runs) so the landing never looks empty
- Releases changelog + FAQ on the marketing surface

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

**Indicators:** SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic (%K/%D), ADX with +DI/−DI, Donchian channel (prior N-bar high/low/mid), VWAP, OBV, volume, candlestick patterns, PRICE  

**Conditions:** greater_than, less_than, cross_above, cross_below, equals  

**Logic:** AND / OR  

**Risk:** fixed shares, % of capital, risk-per-trade sizing, stop-loss, take-profit, max position %, max exposure, leverage, commission, slippage  

**Position management:**

| Field | Meaning |
|-------|---------|
| `trailing_stop` | Stop trails the best price since entry (high for long, low for short) by this fraction; updated at each close and never loosened |
| `scale_out` | Up to 3 `{profit, fraction}` levels: close `fraction` of the position once it is `profit` above the average entry. Gaps through a level fill at the open |
| `breakeven_after_scale` | After the first partial exit the stop moves to the average entry |
| `max_entries` | Pyramiding: while in a position, each bar where the entry rule holds adds one more unit (sized by the same rules, capped by position and exposure limits) until this many entries. Stops and targets re-anchor to the new average entry |

Inside a bar the stop is checked first, then partial exits, then the full take-profit. Each partial exit is a separate trade in the trade list.

**Side:** long (default) or short. A short sells at the next open, holds a cash credit plus a liability marked to market, and covers on the exit rule, a stop above entry, or a take-profit below it.

## Python strategies

Open **Python** in the sidebar (`/code`) and define one function:

```python
def strategy(df):
    # df: date, open, high, low, close, volume
    fast, slow = ta.ema(df["close"], 20), ta.ema(df["close"], 50)
    trend_up = fast > slow
    entry = trend_up & ~trend_up.shift(1, fill_value=False)
    exit = ~trend_up
    size = (0.02 / (ta.atr(df, 14) / df["close"])).clip(0.1, 1.0)  # volatility targeting
    return entry, exit, size          # size is optional: 0..1 of equity per entry
```

Available: `np`, `pd`, `math`, and `ta.sma / ema / rsi / atr / macd / bollinger / vwap / obv` (the engine's own indicators). Stops, take-profit, direction, costs and capital are set in the form; the engine applies them exactly as for plain-English rules.

**Sandbox.** The code runs in a separate `python -I` process with a stripped environment, a 20 s timeout, restricted builtins, imports limited to numpy/pandas/math, and AST checks that block dunder access, file/format I/O and pandas string dispatch (`df.agg("to_csv")`). On Linux the child also gets memory, CPU, file-size and process limits. Results come back as plain JSON and raw floats; the parent never unpickles child output. This is defence in depth, not a hard security boundary: on a public multi-tenant server, run the API in a container (the provided Docker setup) or set `ALLOW_CUSTOM_CODE=false`.

**Look-ahead guard.** Every run reruns the function on the first 50% and 80% of the history. If any signal on those bars changes, the code read the future (`shift(-1)`, whole-series max/mean, centered windows) and the run is rejected with the first offending bar.

## No lock-in

Quantify is MIT-licensed ([LICENSE](LICENSE)), and nothing you build in it is trapped in it:

- **Self-host the whole thing**: `docker compose up --build` (see [Docker Compose](#docker-compose-dev-overlay)) or the plain backend/frontend commands below. No account, no license key, no telemetry you can't turn off.
- **Take your strategies**: the Standalone Python export runs with only numpy and pandas (`python strategy.py prices.csv --trades trades.csv`) and matches the site's trades; rule strategies also export to Pine Script v5.
- **Take your results**: per-run trades CSV, equity CSV and JSON; **Results → Export all (JSON)** downloads every saved run with trades, equity curves and specs (`GET /api/backtests/export-all`).

## Project structure

```
backend/app/          # FastAPI, parsers, engine, risk, metrics, models
backend/data/         # sample CSV bundled for Vercel + local API
backend/tests/
frontend/src/         # React UI
data/sample_data.csv  # same sample for Docker image
uploads/              # runtime CSV uploads
docker-compose.yml
vercel.json           # Vercel Services: web (Vite) + api (FastAPI)
.env.example
.env.vercel.example
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
| `APP_ACCESS_TOKEN` | Production gate password — **auto-generated by deploy** (see `.env.production`) |
| `LLM_API_KEY` | Optional. From [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `LLM_MODEL` | Model name (default `gpt-4o-mini`) |
| `LLM_BASE_URL` | OpenAI-compatible base URL |
| `DATABASE_URL` | SQLAlchemy URL (default SQLite). A Postgres URL from Neon or Supabase (`postgres://…?sslmode=require`) works as is; required on Vercel to keep accounts and history |
| `CORS_ORIGINS` | Allowed frontend origins |
| `FORCE_BUILTIN_PARSER` | Force built-in parser even if a key is set |
| `ALLOW_CUSTOM_CODE` | `true` by default; `false` turns off Python strategies on this server |

Never commit real secrets. `.env` / `.env.production` are gitignored. Full key guide: [DEPLOY.md](DEPLOY.md).

## Run

### Vercel (public URL in a few clicks)

Repo ships with [`vercel.json`](vercel.json) — **Services**: Vite frontend + FastAPI backend on one domain (`/api` → API, everything else → SPA).

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new)
2. Set **Framework Preset → Services**
3. Copy env from [`.env.vercel.example`](.env.vercel.example)
4. Deploy

Details and limits (ephemeral SQLite on `/tmp`): [DEPLOY.md](DEPLOY.md).

### Production (Docker) — ready for users

```bash
cp .env.production.example .env.production
# optional: LLM_API_KEY=sk-... from https://platform.openai.com/api-keys

./deploy/scripts/deploy.sh
# prints APP_ACCESS_TOKEN — paste it on the Access Gate
```

Users open the URL → enter **APP_ACCESS_TOKEN** from `.env.production` → run backtests.  
HTTPS + keys: see [DEPLOY.md](DEPLOY.md).

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
| POST | `/api/auth/register` | Create an account; moves this browser's runs into it |
| POST | `/api/auth/login` | Sign in; returns a session token for the `X-Session` header |
| GET | `/api/auth/me` | Current account, if the session is valid |
| POST | `/api/auth/logout` | End the session |
| GET | `/api/backtests/export-all` | Every saved run of this browser as one JSON archive |
| GET | `/api/backtests/{id}` | Full result |
| GET | `/api/backtests/{id}/export/{pine\|python}` | Pine Script or standalone Python file |
| GET | `/api/python-strategy` | Python template and whether code runs on this server |
| POST | `/api/python-strategy/check` | Static checks on code (nothing executed) |
| POST | `/api/data/upload` | Upload CSV |
| GET | `/api/datasets` | List datasets |
| POST | `/api/backtests/{id}/live-signal` | Refetch latest bars and recompute today's signal |
| GET | `/api/screener/universes` | Built-in ticker lists |
| POST | `/api/screener` | One rule across many tickers: today's action + metrics |
| POST | `/api/discover` | Try 30 classic rule sets, ranked in-sample, judged out-of-sample |
| GET, POST | `/api/forward` | List / start forward tests (from text + ticker or a backtest) |
| GET, DELETE | `/api/forward/{id}` | Forward test detail (auto-refreshed) / delete |
| POST | `/api/forward/{id}/refresh` | Re-score with the latest bars |

## Tests

```bash
cd backend
export PYTHONPATH=.
pytest -q
```

## Limitations

- One position per run, long or short; pyramiding adds to it (no simultaneous long/short or borrow fees)
- Accounts have no email, so a lost password cannot be reset
- Single-asset per run
- Whole-unit sizing when at least one unit fits; fractional units otherwise (e.g. BTC on a small sleeve)
- Built-in parser covers common quant phrasings; LLM expands coverage
- Conservative same-bar stop/take assumption
- Sample CSV is synthetic

## License

MIT, see [LICENSE](LICENSE).
