// Desk "worlds": one stylesheet is loaded at a time, chosen per browser. Switching reloads so no two worlds mix.
import wallCss from './themes/wall.css?url';
import speedpostCss from './themes/speedpost.css?url';
import noticeCss from './themes/notice.css?url';

export type World = 'notice' | 'wall' | 'speedpost';
export const WORLDS: { id: World; name: string; note: string }[] = [
  { id: 'notice', name: 'GiggleGig Board', note: 'Role notices with eligibility checks; the current design' },
  { id: 'wall', name: 'Title Card Wall', note: 'Dark, rows of company tiles' },
  { id: 'speedpost', name: 'Speed Post Counter', note: 'Buff forms and violet date stamps; the backup design' },
];

export function getWorld(): World {
  try {
    const w = localStorage.getItem('desk-world');
    if (w === 'notice' || w === 'wall' || w === 'speedpost') return w;
  } catch { /* storage blocked: use the default */ }
  return 'notice';
}

export function setWorld(w: World) {
  try { localStorage.setItem('desk-world', w); } catch { /* ignore */ }
  window.location.reload();
}

export function loadWorld() {
  const w = getWorld();
  document.documentElement.dataset.world = w;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = w === 'wall' ? wallCss : w === 'notice' ? noticeCss : speedpostCss;
  document.head.appendChild(link);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', w === 'wall' ? '#0E1116' : w === 'notice' ? '#FAF8F2' : '#1F1D1B');
  return w;
}
