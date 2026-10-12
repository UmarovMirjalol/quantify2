import { useEffect } from 'react';

/** Light SEO title/description updates per route (SPA). */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') ?? '';
    if (description && meta) meta.setAttribute('content', description);
    return () => {
      document.title = prev;
      if (description && meta) meta.setAttribute('content', prevDesc);
    };
  }, [title, description]);
}
