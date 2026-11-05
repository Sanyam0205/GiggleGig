import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, useLive } from './api';
import { Icon } from './parts/Icon';
import { DispatchLog } from './parts/DispatchLog';
import { Today } from './views/Today';
import { Review } from './views/Review';
import { Find } from './views/Find';
import { Applications } from './views/Applications';
import { Profile } from './views/Profile';
import { Agents } from './views/Agents';
import { JobSheet } from './views/JobSheet';
import { SlipSheet } from './views/SlipSheet';
import { getTheme, setTheme, type Theme } from './theme';

// Hash routes keep the desk a single static bundle the Node server can serve as-is.
// A sheet (job or slip) can open over any view, at any depth: #/find/Razorpay/job/abc123
export type Route = { view: string; id?: string; sheet?: { kind: 'job' | 'slip'; id: string }; base: string };

// Addresses from the old desk (bookmarks, phone alerts) still land in the right place.
const MOVED: Record<string, string> = { matches: 'review', companies: 'find', pipeline: 'applications', interviews: 'applications', sources: 'profile', contacts: 'profile' };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] && MOVED[parts[0]]) {
    if (parts[0] === 'sources' || parts[0] === 'contacts') parts.splice(1, 0, parts[0]);
    else if (parts[0] === 'pipeline' && parts[1] && parts[1] !== 'job') parts.splice(1, 1);
    parts[0] = MOVED[parts[0]];
  }
  const at = parts.findIndex((p, i) => i > 0 && (p === 'job' || p === 'slip') && parts[i + 1]);
  const head = at === -1 ? parts : parts.slice(0, at);
  return {
    view: head[0] || 'today',
    id: head[1],
    sheet: at === -1 ? undefined : { kind: parts[at] as 'job' | 'slip', id: parts[at + 1] },
    base: `#/${head.join('/') || 'today'}`,
  };
}
export function go(path: string) { window.location.hash = path; }

function useRoute() {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

type Toast = { text: string; error?: boolean } | null;
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const NAV = [
  { view: 'today', label: 'Today', icon: 'today' },
  { view: 'find', label: 'Find', icon: 'search' },
  { view: 'review', label: 'Review', icon: 'match' },
  { view: 'applications', label: 'Applications', icon: 'pipeline' },
  { view: 'profile', label: 'Profile', icon: 'contacts' },
];

export function App() {
  const route = useRoute();
  const [toast, setToast] = useState<Toast>(null);
  const [drawer, setDrawer] = useState(false);
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const show = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), error ? 6000 : 2800);
  }, []);
  const { data: today } = useLive(api.today, [], (m) => Boolean(m.queueChanged || m.runs || m.jobsChanged));
  const { data: cfg } = useLive(api.config, [], () => false);
  const pending = today?.queue.filter((q) => q.status === 'pending').length ?? 0;
  const applied = today?.stages.filter((s) => ['applied', 'referral-pending', 'referred', 'interviewing', 'offer'].includes(s.status)).reduce((n, s) => n + s.n, 0) ?? 0;
  const running = (today?.running ?? []).length;
  const fresh = today?.newMatches.length ?? 0;
  const count = (v: string) => (v === 'today' ? pending : v === 'review' ? fresh : v === 'applications' ? applied : 0);
  const pickTheme = (t: Theme) => { setTheme(t); setThemeState(t); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Sheets layer over the current view: #/today/slip/12, #/review/job/abc
  const sheet = route.sheet?.kind === 'slip' ? <SlipSheet id={Number(route.sheet.id)} back={route.base} />
    : route.sheet?.kind === 'job' ? <JobSheet id={route.sheet.id} back={route.base} /> : null;
  const masthead = <a className="masthead" href="#/today">Giggle<i>Gig</i></a>;

  return (
    <ToastCtx.Provider value={show}>
      <div className="mobile-top">
        {masthead}
        <span className="sp" />
        <button className="rail-btn" onClick={() => setDrawer(true)}><span className={`live-dot${running ? ' on' : ''}`} />Agents</button>
      </div>
      <div className="shell">
        <nav className="rail" aria-label="Desk">
          {masthead}
          <div className="masthead-sub">Situations vacant · {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}<br />{cfg?.profile?.name ?? 'Your job search'}</div>
          {NAV.map((n) => (
            <a key={n.view} className="nav" href={`#/${n.view}`} aria-current={route.view === n.view ? 'page' : undefined}>
              <Icon name={n.icon} size={18} />
              {n.label}
              {count(n.view) > 0 && <span className="count">{count(n.view)}</span>}
            </a>
          ))}
          <span className="spacer" />
          <div className="rail-foot">
            <button className="rail-btn" onClick={() => setDrawer(true)}>
              <span className={`live-dot${running ? ' on' : ''}`} />Agents{running ? ` · ${running} running` : ''}
            </button>
            <div className="theme-switch" role="group" aria-label="Theme">
              {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                <button key={t} aria-pressed={theme === t} onClick={() => pickTheme(t)}>{t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}</button>
              ))}
            </div>
          </div>
        </nav>
        <main className="page">
          {route.view === 'today' && <Today data={today} />}
          {route.view === 'find' && <Find key={route.id ?? ''} company={route.id ? decodeURIComponent(route.id) : undefined} />}
          {route.view === 'review' && <Review openId={route.id} />}
          {route.view === 'applications' && <Applications />}
          {route.view === 'profile' && <Profile tab={route.id} />}
          {route.view === 'agents' && <Agents runId={route.id ? Number(route.id) : undefined} />}
        </main>
      </div>
      {drawer && (
        <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Agent register">
          <button className="scrim" aria-label="Close" onClick={() => setDrawer(false)} />
          <div className="drawer">
            <div className="top"><span className="sp" style={{ flex: 1 }} /><button className="iconbtn" aria-label="Close" onClick={() => setDrawer(false)}><Icon name="close" size={18} /></button></div>
            <DispatchLog title="Agent register" limit={14} />
          </div>
        </div>
      )}
      {sheet}
      {toast && <div className={`toast${toast.error ? ' error' : ''}`} role="status">{toast.text}</div>}
    </ToastCtx.Provider>
  );
}
