import { useMemo, useState } from 'react';
import { api, ago, formatPay, useLive, type MatchRow } from '../api';
import { useToast } from '../App';
import { Icon } from '../parts/Icon';
import { TailorMode } from '../parts/TailorMode';
import { Wall, matchRows } from '../parts/Tiles';
import { getWorld } from '../world';
import { NoticeList } from '../parts/Notice';

const VERDICT: Record<string, { label: string; tag: string }> = {
  apply: { label: 'apply', tag: 'violet' }, 'referral-only': { label: 'referral first', tag: 'red' }, skip: { label: 'skip', tag: 'ink' },
};
const IN_FLIGHT = ['tailoring', 'awaiting-approval', 'approved', 'applied', 'referral-pending', 'referred', 'interviewing', 'offer', 'accepted'];

export const platformName = (src: string) => {
  const [kind, site] = src.split(':');
  const names: Record<string, string> = { linkedin: 'LinkedIn', naukri: 'Naukri', indeed: 'Indeed', glassdoor: 'Glassdoor', google: 'Google Jobs', zip_recruiter: 'ZipRecruiter' };
  if (kind === 'jobspy') return names[site] ?? site;
  if (kind === 'jsearch') return names[site] ?? (site ? site.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Google Jobs');
  if (kind === 'gmail') return site?.startsWith('linkedin') ? 'LinkedIn alert' : `${(site ?? 'email').replace(/-.*/, '').replace(/^./, (c) => c.toUpperCase())} (email)`;
  if (kind === 'web') return 'Web search';
  if (kind === 'firecrawl') return site ? `${site.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())} (crawl)` : 'Firecrawl';
  return ({ greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workable: 'Workable', smartrecruiters: 'SmartRecruiters', adzuna: 'Adzuna', jooble: 'Jooble', remoteok: 'RemoteOK', remotive: 'Remotive', hackernews: 'HN', manual: 'You', wellfound: 'Wellfound', ycombinator: 'Y Combinator', cutshort: 'Cutshort', instahyre: 'Instahyre', himalayas: 'Himalayas', remoterocketship: 'RemoteRocketship', weworkremotely: 'We Work Remotely', boards: 'Company board' } as Record<string, string>)[kind] ?? kind;
};

/** Posted pay wins; otherwise the scorer's estimate, labelled as one. */
function Pay({ j }: { j: MatchRow }) {
  const posted = formatPay(j.salary_min, j.salary_max, j.currency);
  if (posted) return <span className="pay">{posted}<span className="pay-k">posted</span></span>;
  const est = j.salaryEst && formatPay(j.salaryEst.min, j.salaryEst.max, j.salaryEst.currency);
  if (est) return <span className="pay est">{est}<span className="pay-k">estimate</span></span>;
  return <span className="sub">—</span>;
}

/** Every role you match, from every platform, with tailoring one click (or zero, in automatic mode) away. */
export function Matches() {
  const toast = useToast();
  // The Sources tab can hand over a platform filter when you click its match count.
  const [platform, setPlatform] = useState(() => {
    try { const p = sessionStorage.getItem('platform') ?? ''; sessionStorage.removeItem('platform'); return p; } catch { return ''; }
  });
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<'rows' | 'list' | 'notices'>(getWorld() === 'wall' ? 'rows' : getWorld() === 'notice' ? 'notices' : 'list');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data: src } = useLive(api.sources, [], (m) => Boolean(m.jobsChanged));
  const minFit = showAll ? undefined : src?.thresholds.skip ?? 60;
  const { data, error } = useLive(() => api.matches({ minFit, platform, q }), [minFit, platform, q], (m) => Boolean(m.jobsChanged));
  const unscored = src?.platforms.reduce((n, p) => n + p.passed - p.scored, 0) ?? 0;

  const rows = useMemo(() => (data ?? []).filter((j) => showAll || j.fit_score != null), [data, showAll]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function tailor(ids: string[]) {
    try {
      await (ids.length === 1 ? api.tailor(ids[0]) : api.tailorMany(ids));
      setPicked(new Set());
      toast(`Tailoring ${ids.length} CV${ids.length > 1 ? 's' : ''}. They're in Pipeline → Being worked on until the CVs are ready.`);
    } catch (e: any) { toast(e.message, true); }
  }
  async function evaluate(ids: string[]) {
    try {
      await api.evaluateMany(ids);
      setPicked(new Set());
      toast(`Evaluating ${ids.length} role${ids.length > 1 ? 's' : ''}: about 3 minutes each. Reports appear on each job.`);
    } catch (e: any) { toast(e.message, true); }
  }
  async function searchNow() {
    try { await api.start('scout'); toast('Searching every enabled source. Roles appear as each one finishes, and get a quick review.'); }
    catch (e: any) { toast(e.message, true); }
  }
  async function scoreNow() {
    await api.start('score');
    toast('Scoring started — matches appear here as each batch finishes.');
  }

  const platforms = (src?.platforms ?? []).filter((p) => p.matched > 0 || (showAll && p.passed > 0));

  return (
    <>
      <header className="head">
        <h1>Matches</h1>
        <span className="meta">
          {showAll ? 'Every role that passed the gate' : `Every role scoring ${src?.thresholds.skip ?? 60}+ fit`}, from every platform
          {unscored > 0 && <> · <button className="link" onClick={scoreNow}>{unscored} waiting to be scored — score now</button></>}
        </span>
        <span className="sp" />
        <button className="btn frank" onClick={searchNow}>Search now</button>
        <TailorMode />
      </header>

      <div className="chips" role="tablist" aria-label="Platform">
        <button role="tab" aria-selected={platform === ''} onClick={() => setPlatform('')}>All platforms</button>
        {platforms.map((p) => (
          <button key={p.key} role="tab" aria-selected={platform === p.prefix} onClick={() => setPlatform(p.prefix)}>
            {p.name}<span className="n">{showAll ? p.passed : p.matched}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Company or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search matches" /></label>
        <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Include unscored and below {src?.thresholds.skip ?? 60}</label>
        <span className="sp" />
        {view === 'list' && picked.size > 0 && <button className="btn" onClick={() => evaluate([...picked])}>Evaluate {picked.size} selected</button>}
        {view === 'list' && picked.size > 0 && <button className="btn frank" onClick={() => tailor([...picked])}>Tailor {picked.size} selected</button>}
        {getWorld() === 'notice' && (
          <div className="viewtoggle mode" role="group" aria-label="View">
            <button role="radio" aria-checked={view === 'notices'} onClick={() => setView('notices')}>Notices</button>
            <button role="radio" aria-checked={view === 'list'} onClick={() => setView('list')}>Table</button>
          </div>
        )}
        {getWorld() === 'wall' && (
          <div className="viewtoggle" role="group" aria-label="View">
            <button aria-pressed={view === 'rows'} onClick={() => setView('rows')}>Rows</button>
            <button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          </div>
        )}
      </div>

      {error && <div className="notice">{error}</div>}
      {data && rows.length === 0 && (
        <div className="counter-empty">
          <h3>{unscored > 0 ? `${unscored} roles are waiting for the scorer.` : 'No matches yet.'}</h3>
          <p>
            {unscored > 0
              ? 'Score them now, or let the 07:00 briefing do it. Each role gets a 0–100 fit against your experience library and career plan.'
              : 'Run a scout from the Sources tab. Roles that pass the gate are scored, and everything 60+ shows up here.'}
          </p>
          {unscored > 0 && <button className="btn frank" onClick={scoreNow}>Score {unscored} roles</button>}
        </div>
      )}

      {rows.length > 0 && view === 'rows' && src && !platform && !q && <Wall rows={matchRows(rows, src.thresholds)} base="#/matches" />}
      {rows.length > 0 && view === 'notices' && <NoticeList rows={rows} base="#/matches" />}
      {rows.length > 0 && (view === 'list' || (view === 'rows' && (platform || q))) && <MatchTable rows={rows} base="#/matches" picked={picked} toggle={toggle} onTailor={tailor} />}
    </>
  );
}

/** The match table, shared by Matches and company pages. Selection is optional. */
export function MatchTable({ rows, base, picked, toggle, onTailor }: {
  rows: MatchRow[]; base: string; picked?: Set<string>; toggle?: (id: string) => void; onTailor?: (ids: string[]) => void;
}) {
  const toast = useToast();
  const tailor = onTailor ?? (async (ids: string[]) => {
    try { await api.tailor(ids[0]); toast('Tailoring. The job is now in Pipeline → Being worked on, then Waiting for you.'); }
    catch (e: any) { toast(e.message, true); }
  });
  const tailorable = (j: MatchRow) => !IN_FLIGHT.includes(j.status);
  return (
    <table className="ledger">
      <thead>
        <tr>
          {toggle && <th aria-label="Select" />}
          <th className="r">Fit</th><th>Role</th><th>Verdict</th><th>Pay</th><th className="hide-sm">Location</th>
          <th>Found on</th><th className="hide-sm">You know</th><th className="hide-sm r">Seen</th><th className="r" aria-label="Action" />
        </tr>
      </thead>
      <tbody>
        {rows.map((j) => (
          <tr key={j.id} className="click" onClick={() => { window.location.hash = `${base}/job/${j.id}`; }}>
            {toggle && (
              <td onClick={(e) => e.stopPropagation()}>
                {tailorable(j) && <input type="checkbox" checked={picked?.has(j.id) ?? false} onChange={() => toggle(j.id)} aria-label={`Select ${j.title}`} />}
              </td>
            )}
            <td className="r"><b className="num fitcell">{j.fit_score ?? '—'}</b></td>
            <td>
              <div className="t">{j.title}</div>
              <div className="sub">{j.company}</div>
              {j.rationale && <div className="why">{j.rationale}</div>}
            </td>
            <td>{j.verdict ? <span className={`tag ${VERDICT[j.verdict]?.tag ?? (j.verdict === 'triage pass' ? 'violet' : 'ink')}`}>{VERDICT[j.verdict]?.label ?? j.verdict}</span> : <span className="tag ink">unscored</span>}</td>
            <td><Pay j={j} /></td>
            <td className="hide-sm">{j.location ?? '—'}{j.remote ? ' · remote' : ''}</td>
            <td><div className="srcs">{[...new Set<string>(JSON.parse(j.sources).map(platformName))].map((p) => <span key={p} className="src">{p}</span>)}</div></td>
            <td className="hide-sm">{j.warm ? <span className="tag green">{j.warm}</span> : <span className="sub">—</span>}</td>
            <td className="hide-sm r mono sub">{ago(j.first_seen)}</td>
            <td className="r" onClick={(e) => e.stopPropagation()}>
              {tailorable(j)
                ? <button className="btn ghost small" onClick={() => tailor([j.id])}>Tailor</button>
                : <span className="tag violet">{j.status.replace(/-/g, ' ')}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
