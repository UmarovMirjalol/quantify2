/** Trigger a browser download for text content. */
export function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const raw = cell == null ? '' : String(cell);
          if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
          return raw;
        })
        .join(','),
    )
    .join('\n');
}
