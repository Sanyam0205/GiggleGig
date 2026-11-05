import { useState } from 'react';
import { api, ago, useLive, type Platform } from '../api';
import { useToast } from '../App';
import { TailorMode } from '../parts/TailorMode';
import { AlertsPanel } from '../parts/AlertsPanel';
import { EnginePanel } from '../parts/EnginePanel';

const GROUPS: { key: string; setting: string; run: string; title: string; note: (g: any) => string }[] = [
  { key: 'jobspy', setting: 'jobspy', run: 'jobspy', title: 'Job boards', note: (g) => g.python ? `Searches ${g.locations?.join(', ')} for your queries, last 48 h` : 'Needs Python 3.10+ with python-jobspy in .venv' },
  { key: 'apis', setting: 'apis', run: 'apis', title: 'Job-search APIs', note: (g) => {
    const k = g.keys ?? {};
    const missing = [!k.jsearch && 'JSEARCH_API_KEY', !k.adzuna && 'ADZUNA_APP_ID/KEY', !k.jooble && 'JOOBLE_API_KEY'].filter(Boolean);
    return missing.length === 3 ? 'No keys yet: add them to .env to switch these on (see .env.example)'
      : `JSearch ${k.jsearch ? 'on' : 'off'} · Adzuna ${k.adzuna ? 'on' : 'off'} · Jooble ${k.jooble ? 'on' : 'off'}${missing.length ? ` · missing ${missing.join(', ')}` : ''}`;
  } },
  { key: 'ats', setting: 'ats', run: 'ats', title: 'Company career boards', note: () => 'Checks configured company career sites and supported applicant tracking systems.' },
  { key: 'gmail', setting: 'gmailAlerts', run: 'gmail', title: 'Alert emails (Gmail)', note: (g) => `Reads job alerts from the last ${g.lookbackDays} days. Read-only; nothing is labelled or sent` },
  { key: 'startups', setting: 'startups', run: 'startups', title: 'Startup and remote boards', note: (g) => `Wellfound, Y Combinator, Cutshort, Instahyre, Himalayas and more${g.remoteOnly ? `. Remote roles open to ${g.country} only` : ''}` },
  { key: 'remoteok', setting: 'remoteok', run: 'remoteok', title: 'RemoteOK', note: () => 'Remote roles, public feed' },
  { key: 'remotive', setting: 'remotive', run: 'remotive', title: 'Remotive', note: () => 'Remote software roles, public feed' },
  { key: 'hackernews', setting: 'hackernews', run: 'hackernews', title: 'Hacker News', note: () => 'This month’s “Who is hiring” thread' },
  { key: 'firecrawl', setting: 'firecrawl', run: 'firecrawl', title: 'Firecrawl crawl', note: (g) => `An agent crawls career pages no adapter reads and searches LinkedIn, Naukri, Wellfound and other platforms with Firecrawl. Up to ${g.maxCalls} Firecrawl calls a run (they use Firecrawl credits).` },
  { key: 'web', setting: 'webSearch', run: 'web', title: 'Open web search', note: () => 'An agent searches ATS pages, Wellfound and career sites the other scouts miss, and adds boards it discovers' },
];

export function Sources({ embedded = false }: { embedded?: boolean }) {
  const toast = useToast();
  const { data, refresh } = useLive(api.sources, [], (m) => Boolean(m.jobsChanged || m.runs));
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return <header className="head"><h1>Sources</h1><span className="meta">Loading…</span></header>;

  async function toggle(setting: string, enabled: boolean) {
    await api.settings({ source: { key: setting, enabled } });
    refresh();
  }
  async function toggleSite(site: string, on: boolean) {
    const sites = data!.groups.jobspy.sites as string[];
    await api.settings({ jobspySites: on ? [...sites, site] : sites.filter((s) => s !== site) });
    refresh();
  }
  async function run(key: string) {
    setBusy(key);
    try { await api.scoutOne(key); toast('Scout started. Roles are saved as each source finishes, then scored.'); }
    catch (e: any) { toast(e.message, true); }
    finally { window.setTimeout(() => setBusy(null), 1500); }
  }

  const byGroup = (g: string) => data.platforms.filter((p) => p.group === g);
  const totals = data.platforms.reduce((t, p) => ({ found: t.found + p.found, passed: t.passed + p.passed, matched: t.matched + p.matched }), { found: 0, passed: 0, matched: 0 });
  const agentRun = (name: string) => data.agentRuns.find((r) => r.agent === name);

  return (
    <>
      <header className="head">
        {!embedded && <h1>Sources</h1>}
        <span className="meta">
          {totals.found.toLocaleString('en-IN')} postings found · {totals.passed} passed the gate · {totals.matched} matched
          {data.lastScout ? ` · last scout ${ago(data.lastScout.ended_at ?? data.lastScout.started_at)}` : ' · never scouted'}
        </span>
        <span className="sp" />
        <button className="btn" disabled={busy === 'all'} onClick={async () => { setBusy('all'); await api.start('scout'); toast('Scouting every enabled source. Roles appear as each one finishes, then get scored.'); window.setTimeout(() => setBusy(null), 1500); }}>
          Scout all now
        </button>
      </header>

      {!embedded && <EnginePanel />}

      <section className="automation">
        <h2 className="section">Automation</h2>
        <p className="muted">The 07:00 briefing scouts every enabled source, scores new roles, checks your inbox and calendar, and (in automatic mode) tailors resumes. A full scout runs every 4 hours; the fast lane in between.</p>
        <TailorMode />
        <AlertsPanel />
      </section>

      {GROUPS.map((g) => {
        const group = data.groups[g.key];
        const rows = byGroup(g.key);
        const agent = g.key === 'gmail' ? agentRun('scout:gmail') : g.key === 'web' ? agentRun('scout:web') : g.key === 'firecrawl' ? agentRun('scout:firecrawl') : null;
        const running = data.running.some((r) => r.includes(g.run)) || busy === g.run;
        return (
          <section key={g.key} className={`source${group.enabled ? '' : ' off'}`}>
            <div className="source-head">
              <label className="switch">
                <input type="checkbox" checked={group.enabled} onChange={(e) => toggle(g.setting, e.target.checked)} />
                <span aria-hidden="true" />
                <span className="sr-only">Enable {g.title}</span>
              </label>
              <div>
                <h3>{g.title}</h3>
                <p className="muted">{g.note(group)}</p>
                {agent?.status === 'failed' && <p className="err">Last run failed {ago(agent.started_at)}: {agent.error}</p>}
              </div>
              <span className="sp" />
              <button className="btn ghost small" disabled={!group.enabled || running} onClick={() => run(g.run)}>
                {running ? <span className="spin" /> : null}Scout now
              </button>
            </div>
            {rows.length > 0 && (
              <table className="ledger compact">
                <thead><tr>{g.key === 'jobspy' && <th aria-label="Include" />}<th>Platform</th><th className="r">Found</th><th className="r">Passed gate</th><th className="r">Scored</th><th className="r">Matched</th><th className="r hide-sm">Last posting</th></tr></thead>
                <tbody>
                  {rows.map((p: Platform) => (
                    <tr key={p.key} className={p.found ? '' : 'quiet'}>
                      {g.key === 'jobspy' && (
                        <td><input type="checkbox" checked={group.sites.includes(p.key.split(':')[1])} onChange={(e) => toggleSite(p.key.split(':')[1], e.target.checked)} aria-label={`Include ${p.name}`} /></td>
                      )}
                      <td><div className="t">{p.name}</div><div className="sub">{p.how}</div></td>
                      <td className="r num">{p.found.toLocaleString('en-IN')}</td>
                      <td className="r num">{p.passed}</td>
                      <td className="r num">{p.scored}</td>
                      <td className="r num">{p.matched > 0 ? <a href={`#/matches`} onClick={() => sessionStorage.setItem('platform', p.prefix)}><b>{p.matched}</b></a> : 0}</td>
                      <td className="r mono sub hide-sm">{p.lastSeen ? ago(p.lastSeen) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}


      {data.lastScout && (
        <section className="source">
          <h3>Last scout log</h3>
          <div className="events" style={{ marginTop: 8 }}>
            {data.lastScout.log.map((l, i) => <div key={i} className="e"><span /><span className="ty">log</span><span className="tx">{l}</span></div>)}
          </div>
        </section>
      )}
    </>
  );
}
