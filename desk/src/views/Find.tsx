import { api, ago, useLive } from '../api';
import { useToast } from '../App';
import { Companies } from './Companies';

/** Find: search everything now, or one company's own career site; and what the last search found where. */
export function Find({ company }: { company?: string }) {
  const toast = useToast();
  const { data: src } = useLive(api.sources, [], (m) => Boolean(m.jobsChanged || m.runs));
  const running = (src?.running ?? []).some((r) => r.startsWith('scout'));
  async function search() {
    try { await api.start('scout'); toast('Searching every source. Roles appear on Review as each finishes.'); } catch (e: any) { toast(e.message, true); }
  }
  const found = (src?.platforms ?? []).filter((p) => p.found > 0).sort((a, b) => b.matched - a.matched || b.passed - a.passed);
  return (
    <>
      <header className="head">
        <h1>Find</h1>
        <span className="meta">{src?.lastScout ? `Last search ${ago(src.lastScout.ended_at ?? src.lastScout.started_at)}` : 'Never searched yet'}</span>
        <span className="sp" />
        <button className="btn frank" disabled={running} onClick={search}>{running ? <><span className="spin" /> Searching…</> : 'Search everything now'}</button>
      </header>
      <Companies name={company} embedded />
      {!company && (
        <section className="source">
          <div className="source-head"><h3>Where roles came from</h3><span className="sp" /><a className="small" href="#/profile/sources">Turn sources on or off</a></div>
          <table className="ledger compact">
            <thead><tr><th>Source</th><th className="r">Found</th><th className="r">Passed the filters</th><th className="r">Matched</th><th className="r hide-sm">Latest</th></tr></thead>
            <tbody>
              {found.map((p) => (
                <tr key={p.key}><td><div className="t">{p.name}</div><div className="sub">{p.how}</div></td>
                  <td className="r">{p.found.toLocaleString('en-IN')}</td><td className="r">{p.passed}</td><td className="r">{p.matched ? <b>{p.matched}</b> : 0}</td>
                  <td className="r sub hide-sm">{p.lastSeen ? ago(p.lastSeen) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
          {src?.lastScout && src.lastScout.log.length > 0 && (
            <details className="how" style={{ marginTop: 12 }}><summary>Last search, step by step</summary>
              <div className="events" style={{ marginTop: 8 }}>{src.lastScout.log.map((l, i) => <div key={i} className="e"><span /><span className="ty">log</span><span className="tx">{l}</span></div>)}</div>
            </details>
          )}
        </section>
      )}
    </>
  );
}
