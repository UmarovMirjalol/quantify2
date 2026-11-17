import type { BacktestResult } from '../types';

/** Standalone Python snippet that reproduces the run via the quantify package. */
export function reproducePython(result: BacktestResult): string {
  const text = (result.strategy_description || 'Buy when SMA 20 crosses above SMA 50.').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const asset = result.strategy.asset || 'SPY';
  const dataset = result.dataset_name || 'your.csv';
  return `# Quantify reproduce · backtest #${result.id}
# pip install -e ./backend   (from the repo root)
from quantify import Engine, load_csv

TEXT = '''${text}'''
engine = Engine.from_text(TEXT, asset='${asset}')
# Prefer your saved CSV / dataset path:
df = load_csv('${dataset}')
out = engine.run(df)
print(out['metrics'])
print(out.get('live_signal'))
`;
}

/** Minimal Jupyter notebook that loads the same reproduce cell. */
export function reproduceNotebook(result: BacktestResult): string {
  const code = reproducePython(result);
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
    },
    cells: [
      {
        cell_type: 'markdown',
        metadata: {},
        source: [
          `# Quantify · reproduce #${result.id}\n`,
          `\n`,
          `${result.strategy_description}\n`,
          `\n`,
          `Dataset: \`${result.dataset_name}\` · Sharpe ${result.metrics.sharpe_ratio ?? '—'} · Return ${
            result.metrics.total_return == null ? '—' : `${(result.metrics.total_return * 100).toFixed(2)}%`
          }\n`,
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: code.split('\n').map((line, i, arr) => (i < arr.length - 1 ? `${line}\n` : line)),
      },
    ],
  };
  return JSON.stringify(nb, null, 2);
}
