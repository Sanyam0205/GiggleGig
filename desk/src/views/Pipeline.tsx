import { useEffect, useMemo, useState } from 'react';
import { api, ago, formatPay, useLive, type MatchRow } from '../api';
import { useToast } from '../App';
import { Icon } from '../parts/Icon';
import { LANES, justMoved, laneOf, nextStep, type Lane } from '../parts/lanes';

const PREVIEW = 12;

/** Every job, clustered by where it is in the search. Lanes run left to right in the order jobs move. */
export function Pipeline({ lane: focusLane }: { lane?: string }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const { data, error } = useLive(() => api.matches({ q }) as Promise<MatchRow[]>, [q], (m) => Boolean(m.jobsChanged || m.runs));
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(LANES.map((l) => [l.key, Boolean(l.open)])));
  const [all, setAll] = useState<Record<string, boolean>>({});

  const byLane = useMemo(() => {
    const m = new Map<string, MatchRow[]>(LANES.map((l) => [l.key, []]));
    for (const j of data ?? []) m.get(laneOf(j.status).key)!.push(j);
    for (const list of m.values()) list.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '') || (b.fit_score ?? 0) - (a.fit_score ?? 0));
    return m;
  }, [data]);

  // Arriving from a toast or link (#/pipeline/working) opens and scrolls to that lane.
  useEffect(() => {
    if (!focusLane || !data) return;
    setOpen((o) => ({ ...o, [focusLane]: true }));
    window.setTimeout(() => document.getElementById(`lane-${focusLane}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [focusLane, data]);

  async function act(j: MatchRow, kind: 'evaluate' | 'tailor') {
    try {
      await (kind === 'evaluate' ? api.evaluate(j.id) : api.tailor(j.id));
      toast(`${j.company}: moved to "Being worked on".`);
    } catch (e: any) { toast(e.message, true); }
  }

  const jump = (l: Lane) => { window.location.hash = `#/pipeline/${l.key}`; };

  return (
    <>
      <header className="head">
        <h1>Pipeline</h1>
        <span className="meta">Every role, in the lane it's in now. A job only ever moves forward through these, or to Closed.</span>
      </header>

      <nav className="flow" aria-label="Pipeline lanes">
        {LANES.map((l, i) => (
          <button key={l.key} className={`flow-step${l.key === 'closed' ? ' aside' : ''}${focusLane === l.key ? ' on' : ''}`} onClick={() => jump(l)}>
            <span className="n num">{byLane.get(l.key)?.length ?? 0}</span>
            <span className="t">{l.title}</span>
            {i < LANES.length - 2 && <span className="arrow" aria-hidden="true"><Icon name="arrowRight" size={14} /></span>}
          </button>
        ))}
      </nav>

      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Find any job by company or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a job" /></label>
        {q && <span className="muted small">Showing matches in every lane</span>}
      </div>
      {error && <div className="notice">{error}</div>}

      {LANES.map((l) => {
        const jobs = byLane.get(l.key) ?? [];
        const isOpen = open[l.key] || Boolean(q);
        const shown = all[l.key] || q ? jobs : jobs.slice(0, PREVIEW);
        return (
          <section key={l.key} id={`lane-${l.key}`} className={`lane lane-${l.key}`}>
            <button className="lane-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [l.key]: !isOpen }))}>
              <span className="caret" aria-hidden="true"><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={16} /></span>
              <h2>{l.title}</h2>
              <span className="count num">{jobs.length}</span>
              <span className="sub">{l.sub}</span>
            </button>
            {isOpen && (
              jobs.length === 0
                ? <div className="empty-line">Nothing here right now.</div>
                : (
                  <div className="lane-cards">
                    {shown.map((j) => {
                      const pay = formatPay(j.salary_min, j.salary_max, j.currency) ?? j.advertisedComp ?? null;
                      return (
                        <article key={j.id} className={`jcard${justMoved(j.updated_at) ? ' moved' : ''}${l.key === 'working' ? ' busy' : ''}`}>
                          <a className="jmain" href={`#/pipeline/${l.key}/job/${j.id}`}>
                            <span className="jscore num">{j.score5 != null ? j.score5.toFixed(1) : j.triage ? j.triage.score.toFixed(1) : j.fit_score ?? '—'}<small>{j.score5 != null ? '/5' : j.triage ? 'triage' : 'fit'}</small></span>
                            <span className="jtext">
                              <span className="jt">{j.title}</span>
                              <span className="jc">{j.company}{j.location ? ` · ${j.location}` : ''}{pay ? ` · ${pay}` : ''}</span>
                              <span className="jn">{l.key === 'working' && <span className="spin inline" aria-hidden="true" />}{nextStep(j)}</span>
                            </span>
                          </a>
                          <span className="jside">
                            {justMoved(j.updated_at) && <span className="tag violet">just moved</span>}
                            <span className="mono small muted">{ago(j.updated_at)}</span>
                            {j.status === 'sourced' && <button className="btn ghost small" onClick={() => act(j, 'evaluate')}>Evaluate</button>}
                            {(j.status === 'shortlisted' || j.status === 'needs-referral') && <button className="btn frank small" onClick={() => act(j, 'tailor')}>Tailor CV</button>}
                            {j.status === 'awaiting-approval' && <a className="btn small" href="#/today">Review</a>}
                          </span>
                        </article>
                      );
                    })}
                    {!all[l.key] && !q && jobs.length > PREVIEW && (
                      <button className="btn ghost small more-btn" onClick={() => setAll((a) => ({ ...a, [l.key]: true }))}>Show all {jobs.length}</button>
                    )}
                  </div>
                )
            )}
          </section>
        );
      })}
    </>
  );
}
