import { useEffect, useRef, useState } from 'react';
import { api, ago, duration, useLive, useStream, type RunEvent } from '../api';
import { fmtClock } from '../parts/postal';
import { useToast } from '../App';

export function Agents({ runId }: { runId?: number }) {
  const { data: runs } = useLive(() => api.runs(150), [], (m) => Boolean(m.runs));
  const { data: candidate } = useLive(() => api.candidate(), [], (m) => Boolean(m.runs));
  const selected = runId ?? runs?.[0]?.id;
  const [detail, setDetail] = useState<any>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const anyRunning = (runs ?? []).some((r) => r.status === 'running');
  async function stop(id?: number) {
    const r = id ? await api.stop(id) : await api.stopAll();
    toast(r.stopped ? `Stopped ${r.stopped} run${r.stopped > 1 ? 's' : ''}.` : 'Nothing was running.');
    if (id) setDetail((d: any) => d && { ...d, status: 'stopped' });
  }
  async function uploadResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setResumeBusy(true);
    try {
      await api.uploadResume(file);
      toast('Resume intake started. The search begins as soon as the profile is built.');
    } catch (err: any) { toast(err.message, true); }
    finally { setResumeBusy(false); }
  }

  useEffect(() => { if (selected) api.run(selected).then(setDetail); }, [selected]);
  useStream((m) => {
    if (!selected) return;
    const mine = (m.events ?? []).filter((e) => e.run_id === selected);
    const runUpdate = (m.runs ?? []).find((r) => r.id === selected);
    if (mine.length || runUpdate) {
      setDetail((d: any) => d && { ...d, ...(runUpdate ?? {}), events: [...d.events, ...mine.filter((e: RunEvent) => !d.events.some((x: RunEvent) => x.id === e.id))] });
    }
  });
  useEffect(() => { if (detail?.status === 'running') endRef.current?.scrollIntoView({ block: 'end' }); }, [detail?.events.length]);

  const spend = (runs ?? []).filter((r) => r.started_at >= new Date(Date.now() - 86400000).toISOString().replace('T', ' ').slice(0, 19))
    .reduce((s, r) => s + (r.cost_usd ?? 0), 0);

  return (
    <>
      <header className="head">
        <h1>Agents</h1>
        <span className="meta">Every run, step by step. Last 24 h: {(runs ?? []).filter((r) => r.status === 'failed').length} failed · ≈${spend.toFixed(2)} of metered usage at API prices</span>
        <span className="sp" />
        {anyRunning && <button className="btn reject" onClick={() => stop()}>Stop all agents</button>}
      </header>
      <section className="source" style={{ marginBottom: 18 }}>
        <div className="source-head">
          <div><h3>Start with a candidate resume</h3><p className="muted">Upload PDF, DOCX, TXT, or Markdown (up to 5 MB). A setup agent rebuilds the candidate context from this file only, then the search starts for that candidate.</p></div>
          <label className={`btn frank ${resumeBusy ? 'disabled' : ''}`}>
            {resumeBusy ? <span className="spin" /> : null}Choose resume
            <input type="file" accept=".pdf,.docx,.txt,.md" disabled={resumeBusy} onChange={uploadResume} hidden />
          </label>
        </div>
        {candidate?.state === 'none' && <p className="notice small" style={{ margin: '8px 0 0' }}>No candidate yet. Upload a resume to start: nothing is searched or scored until a profile exists.</p>}
        {candidate?.state === 'intake' && <p className="notice small" style={{ margin: '8px 0 0' }}>Building the candidate profile. The search is paused until it is ready.</p>}
        {candidate?.state === 'failed' && <p className="notice small" style={{ margin: '8px 0 0' }}>Resume intake failed: {candidate.error}. The search stays paused; upload the resume again.</p>}
        <p className="muted small" style={{ margin: '8px 0 0' }}>Starting a new candidate clears the current candidate’s jobs, application statuses, contacts, interviews, run history, and generated files. Your search settings remain.</p>
      </section>
      <div className="split">
        <table className="ledger">
          <thead><tr><th>Agent</th><th>Status</th><th className="r">Took</th><th className="r hide-sm">Started</th></tr></thead>
          <tbody>
            {(runs ?? []).map((r) => (
              <tr key={r.id} className="click" aria-selected={r.id === selected} onClick={() => { window.location.hash = `#/agents/${r.id}`; }}
                style={r.id === selected ? { background: 'var(--paper)' } : undefined}>
                <td><div className="t">{r.agent}</div><div className="sub">{r.company ?? r.model ?? ''}</div></td>
                <td><span className={`tag ${r.status === 'failed' ? 'red' : r.status === 'running' ? 'violet' : 'ink'}`}>{r.status}</span></td>
                <td className="r mono sub">{r.status === 'running' ? ago(r.started_at).replace(' ago', '') : duration(r.duration_ms)}</td>
                <td className="r mono sub hide-sm">{fmtClock(r.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          {detail ? (
            <>
              <h2 className="section" style={{ marginBottom: 6 }}>
                {detail.agent}<span className="c">{detail.model ?? ''} · {detail.turns ?? '—'} turns · {detail.cost_usd != null ? `$${detail.cost_usd.toFixed(3)}` : ''}</span>
                {detail.status === 'running' && <button className="btn reject small" style={{ marginLeft: 'auto' }} onClick={() => stop(detail.id)}>Stop this run</button>}
              </h2>
              {detail.summary && <p className="muted" style={{ marginBottom: 10 }}>{detail.summary}</p>}
              {detail.error && <p className="notice" style={{ marginBottom: 10 }}>{detail.error}</p>}
              <div className="events">
                {detail.events.length === 0 && <div className="e"><span /><span /><span className="tx muted">No steps recorded yet.</span></div>}
                {detail.events.map((e: RunEvent) => (
                  <div key={e.id} className={`e ${e.type}`}>
                    <span className="muted">{fmtClock(e.ts)}</span>
                    <span className="ty">{e.type}</span>
                    <span className="tx">{e.text}</span>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            </>
          ) : <div className="counter-empty"><h3>No runs yet.</h3><p>Start a briefing from Today; each agent's steps stream here as they happen.</p></div>}
        </div>
      </div>
    </>
  );
}
