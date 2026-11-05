// Light, dark (the night edition) or whatever the system says. Remembered per browser.
export type Theme = 'system' | 'light' | 'dark';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem('desk-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch { /* storage blocked: follow the system */ }
  return 'system';
}

export function applyTheme(t: Theme = getTheme()) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0A0A0A' : '#121212');
}

export function setTheme(t: Theme) {
  try { if (t === 'system') localStorage.removeItem('desk-theme'); else localStorage.setItem('desk-theme', t); } catch { /* ignore */ }
  applyTheme(t);
}
