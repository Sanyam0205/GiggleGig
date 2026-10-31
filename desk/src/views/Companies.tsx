import { useEffect, useState } from 'react';
import { api, ago, useLive, useStream, type CompanyDetail } from '../api';
import { useToast } from '../App';
import { Icon } from '../parts/Icon';
import { MatchTable } from './Matches';
import { Wall } from '../parts/Tiles';
import { getWorld } from '../world';
import { NoticeList } from '../parts/Notice';


/** Type a company, get every feasible role there for your profile — searched, filtered and scored in one run. */
export function Companies({ name }: { name?: string }) {
  const toast = useToast();
  const [q, setQ] = useState(name ?? '');
  const { data: list } = useLive(() => api.companies(''), [], (m) => Boolean(m.jobsChanged));

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const n = q.trim();
    if (n.length < 2) return;
    try {
      const r = await api.companySearch(n);
      toast(r.already ? `Already searching ${n}.` : `Searching ${n}: job board, Google for Jobs, careers site…`);
      window.location.hash = `#/companies/${encodeURIComponent(n)}`;
    } catch (err: any) { toast(err.message, true); }
  }

  return (
    <>
      <header className="head">
        <h1>Companies</h1>
        <span className="meta">Search one company for every role that fits your profile, or open one you've already seen.</span>
      </header>
      <form className="company-search" onSubmit={search} role="search">
        <label className="search big"><Icon name="search" size={18} />
          <input placeholder="Company name, e.g. Razorpay, Atlassian, Sarvam AI" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Company name" list="company-list" />
        </label>
        <datalist id="company-list">{(list ?? []).map((c) => <option key={c.company} value={c.company} />)}</datalist>
        <button className="btn frank" type="submit" disabled={q.trim().length < 2}>Find roles</button>
      </form>

      {name ? <CompanyPage name={name} /> : (
        <>
          <h2 className="section" style={{ margin: '22px 0 8px' }}>Seen so far<span className="c">companies with at least one role that passed the gate</span></h2>
          <table className="ledger">
            <thead><tr><th>Company</th><th className="r">Feasible</th><th className="r">Matched</th><th className="r">Best fit</th><th className="hide-sm">You know</th><th className="hide-sm">Board</th></tr></thead>
            <tbody>
              {(list ?? []).map((c) => (
                <tr key={c.company} className="click" onClick={() => { window.location.hash = `#/companies/${encodeURIComponent(c.company)}`; }}>
                  <td><div className="t">{c.company}</div>{c.tier && <div className="sub">tier {c.tier} target</div>}</td>
                  <td className="r num">{c.feasible}</td>
                  <td className="r num">{c.matched ? <b>{c.matched}</b> : 0}</td>
                  <td className="r num">{c.best ?? '—'}</td>
                  <td className="hide-sm">{c.warm ? <span className="tag green">{c.warm} {c.warm === 1 ? 'person' : 'people'}</span> : <span className="sub">—</span>}</td>
                  <td className="hide-sm sub mono">{c.board ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function CompanyPage({ name }: { name: string }) {
  const toast = useToast();
  const [d, setD] = useState<CompanyDetail | null>(null);
  const load = () => api.company(name).then(setD).catch((e) => toast(e.message, true));
  useEffect(() => { setD(null); load(); }, [name]);
  useStream((m) => { if (m.jobsChanged || m.runs?.some((r) => r.agent.toLowerCase() === `company:${name.toLowerCase()}`)) load(); });
  if (!d) return <div className="empty-line">Loading {name}…</div>;
  const searching = d.lastSearch?.status === 'running';

  return (
    <section className="company">
      <div className="company-head">
        <h2>{d.name}</h2>
        {d.target?.tier && <span className="tag violet">tier {d.target.tier} target</span>}
        {d.target?.slug && <span className="tag ink">{d.target.ats}/{d.target.slug}</span>}
        <span className="sp" />
        <button className="btn ghost small" onClick={async () => { await api.companyResearch(d.name); toast('Researching — the brief appears here when done.'); }}>
          {d.research ? 'Refresh research' : 'Research company'}
        </button>
      </div>
      <p className="muted status-line">
        {searching ? <><span className="spin inline" /> Searching now — results stream in.</>
          : d.lastSearch ? `Searched ${ago(d.lastSearch.ended_at ?? d.lastSearch.started_at)} · ${d.lastSearch.summary ?? ''}` : 'Not searched directly yet — press Find roles.'}
        {d.filtered > 0 && ` · ${d.filtered} roles filtered out (${d.filteredReasons.map((r) => `${r.n} ${r.reason}`).join(', ')})`}
      </p>

      <div className="company-grid">
        <div className="company-jobs">
          <h3>{d.jobs.length} feasible role{d.jobs.length === 1 ? '' : 's'}</h3>
          {d.jobs.length === 0
            ? <div className="counter-empty"><h3>No feasible roles at {d.name} right now.</h3><p>{d.filtered ? 'Everything open is outside your level, role type or cities.' : 'Run Find roles to search their board, Google for Jobs and their careers site.'} New postings show up here automatically as scouts find them.</p></div>
            : getWorld() === 'notice'
              ? <NoticeList rows={d.jobs} base={`#/companies/${encodeURIComponent(name)}`} />
            : getWorld() === 'wall'
              ? <><Wall base={`#/companies/${encodeURIComponent(name)}`} rows={[{ key: 'co', title: `Roles at ${d.name}`, sub: 'best fit first', rows: d.jobs }]} /><MatchTable rows={d.jobs} base={`#/companies/${encodeURIComponent(name)}`} /></>
              : <MatchTable rows={d.jobs} base={`#/companies/${encodeURIComponent(name)}`} />}
        </div>
        <aside className="company-side">
          <h3>You know {d.warmPaths.length ? `${d.warmPaths.length}` : 'nobody yet'}</h3>
          {d.warmPaths.length === 0 && <p className="muted small">Import your LinkedIn connections on the Contacts tab to find warm paths.</p>}
          {d.warmPaths.slice(0, 8).map((c) => (
            <div key={c.id} className="li">
              <span>{c.linkedin ? <a href={c.linkedin} target="_blank" rel="noreferrer">{c.name}</a> : c.name}<span className="sub block">{c.role}</span></span>
              <span className={`tag ${c.relationship === 'referrer' || c.relationship === 'warm' ? 'green' : 'violet'}`}>{c.relationship}</span>
            </div>
          ))}
          {d.research && (<><h3 style={{ marginTop: 16 }}>Research brief</h3><div className="paper jd research">{d.research}</div></>)}
        </aside>
      </div>
    </section>
  );
}
