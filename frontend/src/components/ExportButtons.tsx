import { useState } from 'react';
import { exportStrategy } from '../services/api';
import { downloadText } from '../utils/download';
import type { StrategySpec } from '../types';

interface ExportButtonsProps {
  strategy: StrategySpec;
  title?: string;
}

export function ExportButtons({ strategy, title }: ExportButtonsProps) {
  const [loading, setLoading] = useState<'pine' | 'python' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleExport(format: 'pine' | 'python') {
    setLoading(format);
    setError(null);
    try {
      const result = await exportStrategy({ strategy, format, title });
      downloadText(
        result.filename,
        result.code,
        format === 'pine' ? 'text/plain;charset=utf-8' : 'text/x-python;charset=utf-8',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(null);
    }
  }

  async function handleCopy(format: 'pine' | 'python') {
    setError(null);
    try {
      const result = await exportStrategy({ strategy, format, title });
      await navigator.clipboard.writeText(result.code);
      setCopied(format);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copy failed');
    }
  }

  return (
    <div className="export-buttons">
      <div className="export-group">
        <span className="export-label">Export strategy code:</span>
        <div className="export-actions">
          <button
            className="btn btn-export btn-pine"
            disabled={loading !== null}
            onClick={() => handleExport('pine')}
            title="Download Pine Script v5 for TradingView"
          >
            {loading === 'pine' ? '⏳' : '📊'} Pine Script v5
          </button>
          <button
            className="btn btn-export btn-copy"
            onClick={() => handleCopy('pine')}
            title="Copy Pine Script to clipboard"
          >
            {copied === 'pine' ? '✅' : '📋'}
          </button>

          <button
            className="btn btn-export btn-python"
            disabled={loading !== null}
            onClick={() => handleExport('python')}
            title="Download Python bot script"
          >
            {loading === 'python' ? '⏳' : '🐍'} Python Bot
          </button>
          <button
            className="btn btn-export btn-copy"
            onClick={() => handleCopy('python')}
            title="Copy Python script to clipboard"
          >
            {copied === 'python' ? '✅' : '📋'}
          </button>
        </div>
      </div>
      {error && <p className="export-error">⚠️ {error}</p>}
    </div>
  );
}

