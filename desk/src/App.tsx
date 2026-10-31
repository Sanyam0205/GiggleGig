import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, useLive } from './api';
import { Icon } from './parts/Icon';
import { Today } from './views/Today';
import { Pipeline } from './views/Pipeline';
import { Matches } from './views/Matches';
import { Sources } from './views/Sources';
import { Companies } from './views/Companies';
import { Agents } from './views/Agents';
import { Contacts } from './views/Contacts';
import { Interviews } from './views/Interviews';
import { JobSheet } from './views/JobSheet';
import { SlipSheet } from './views/SlipSheet';
import { getWorld } from './world';
import { KIND_LABEL } from './parts/postal';

// Hash routes keep the desk a single static bundle the Node server can serve as-is.
// A sheet (job or slip) can open over any view, at any depth: #/companies/Razorpay/job/abc123
export type Route = { view: string; id?: string; sheet?: { kind: 'job' | 'slip'; id: string }; base: string };
function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
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
  { view: 'matches', label: 'Matches', icon: 'match' },
  { view: 'companies', label: 'Companies', icon: 'company' },
  { view: 'pipeline', label: 'Pipeline', icon: 'pipeline' },
  { view: 'sources', label: 'Sources', icon: 'sources' },
  { view: 'agents', label: 'Agents', icon: 'agents' },
  { view: 'contacts', label: 'Contacts', icon: 'contacts' },
  { view: 'interviews', label: 'Interviews', icon: 'interviews' },
];

export function App() {
  const route = useRoute();
  const [toast, setToast] = useState<Toast>(null);
  const show = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), error ? 6000 : 2600);
  }, []);
  const { data: today } = useLive(api.today, [], (m) => Boolean(m.queueChanged || m.runs));
  const pendingItems = today?.queue.filter((q) => q.status === 'pending') ?? [];
  const pending = pendingItems.length;
  const wall = getWorld() === 'wall';
  const { data: cfg } = useLive(api.config, [], () => false);
  const profile = cfg?.profile;
  const [find, setFind] = useState('');
  async function searchCompany(e: React.FormEvent) {
    e.preventDefault();
    const name = find.trim();
    if (name.length < 2) return;
    try { await api.companySearch(name); show(`Searching ${name} for roles that fit you…`); } catch (err: any) { show(err.message, true); }
    setFind('');
    go(`/companies/${encodeURIComponent(name)}`);
  }

  // Sheets layer over the current view: #/today/slip/12, #/pipeline/job/abc
  const sheet = route.sheet?.kind === 'slip' ? <SlipSheet id={Number(route.sheet.id)} back={route.base} />
    : route.sheet?.kind === 'job' ? <JobSheet id={route.sheet.id} back={route.base} /> : null;

  return (
    <ToastCtx.Provider value={show}>
      <div className="shell">
        <nav className="rail" aria-label="Desk">
          <div className="mark" title="GiggleGig"><Icon name="mail" /></div>
          {getWorld() === 'notice' && <div className="masthead">GiggleGig<small>{profile?.name ?? 'Your job search'}</small></div>}
          {NAV.map((n) => (
            <a key={n.view} className="nav" href={`#/${n.view}`} aria-current={route.view === n.view ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
              {n.view === 'today' && pending > 0 && <span className="count">{pending}</span>}
            </a>
          ))}
          <span className="spacer" />
          {wall && (
            <form className="topsearch" role="search" onSubmit={searchCompany}>
              <Icon name="search" size={16} />
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search a company for roles" aria-label="Search a company for roles" />
            </form>
          )}
        </nav>
        {wall && pending > 0 && (
          <div className="awaiting" role="status">
            <span>Awaiting you: <b>{pending}</b></span>
            {pendingItems.slice(0, 3).map((q) => (
              <a key={q.id} className="item" href={`#/today/slip/${q.id}`}>
                {q.kind === 'application' ? `${q.company} · ${q.job_title}` : `${KIND_LABEL[q.kind] ?? q.kind} · ${q.title}`}
              </a>
            ))}
            <a className="go" href="#/today">Open queue</a>
          </div>
        )}
        <main className="page">
          {route.view === 'today' && <Today data={today} />}
          {route.view === 'matches' && <Matches />}
          {route.view === 'companies' && <Companies key={route.id ?? ''} name={route.id ? decodeURIComponent(route.id) : undefined} />}
          {route.view === 'pipeline' && <Pipeline lane={route.id} />}
          {route.view === 'sources' && <Sources />}
          {route.view === 'agents' && <Agents runId={route.id ? Number(route.id) : undefined} />}
          {route.view === 'contacts' && <Contacts />}
          {route.view === 'interviews' && <Interviews />}
        </main>
      </div>
      {sheet}
      {toast && <div className={`toast${toast.error ? ' error' : ''}`} role="status">{toast.text}</div>}
    </ToastCtx.Provider>
  );
}
