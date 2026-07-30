// Pre-hydration theme: avoids a flash of the wrong theme.
// Kept as a separate file (not inline in index.html) because production serves
// the SPA under `script-src 'self'`, which blocks inline scripts.
(() => {
  try {
    const t = localStorage.getItem('openkeep-theme') || 'system';
    const dark =
      t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    // A forced (non-system) theme must override the media-scoped
    // <meta name="theme-color"> defaults before paint (kept in sync by stores/ui.ts).
    if (t !== 'system') {
      const color = dark ? '#202124' : '#ffffff';
      for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
        m.setAttribute('content', color);
      }
    }
  } catch {}
})();
