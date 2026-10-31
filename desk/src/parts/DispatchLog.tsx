import { useEffect, useState } from 'react';
import { api, duration, useStream, type Run, type RunEvent } from '../api';
import { fmtClock } from './postal';
import { useToast } from '../App';
import { getWorld } from '../world';

type Live = Run & { events: RunEvent[] };

/** Right-hand log of agent runs, newest first, with each running agent's latest steps streaming in. */
export function DispatchLog({ limit = 8, title = 'Dispatch log' }: { limit?: number; title?: string }) {
  const [runs, setRuns] = useState<Live[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    api.runs(limit).then(async (rs) => {
      const withEvents = await Promise.all(rs.map(async (r) => ({ ...r, events: (await api.run(r.id)).events.slice(-3) })));
      setRuns(withEvents);
    });
  }, [limit]);

  useStream((m) => {
    if (!m.runs && !m.events) return;
    setRuns((prev) => {
      const map = new Map(prev.map((r) => [r.id, r]));
      for (const r of m.runs ?? []) map.set(r.id, { ...(map.get(r.id) ?? { events: [] }), ...r } as Live);
      for (const e of m.events ?? []) {
        const r = map.get(e.run_id) ?? ({ id: e.run_id, agent: e.agent ?? 'agent', status: 'running', started_at: e.ts, events: [] } as unknown as Live);
        map.set(e.run_id, { ...r, events: [...r.events, e].slice(-3) });
      }
      return [...map.values()].sort((a, b) => b.id - a.id).slice(0, limit);
    });
  });

  async function start(p: 'briefing' | 'scout' | 'score' | 'tailor') {
    setStarting(p);
    try { await api.start(p); } finally { window.setTimeout(() => setStarting(null), 1500); }
  }

  const anyRunning = runs.some((r) => r.status === 'running');
  // Notice board: every run drawn to its real duration on one shared axis (whole minutes, at least 5).
  const notice = getWorld() === 'notice';
  const elapsed = (r: Live) => r.status === 'running' ? Date.now() - Date.parse(r.started_at.replace(' ', 'T') + 'Z') : (r.duration_ms ?? 0);
  const axisMin = Math.max(5, Math.ceil(Math.max(0, ...runs.map(elapsed)) / 60000));
  async function stop(e: React.MouseEvent, id?: number) {
    e.preventDefault();
    e.stopPropagation();
    const r = id ? await api.stop(id) : await api.stopAll();
    setRuns((prev) => prev.map((x) => (id ? x.id === id : x.status === 'running') ? { ...x, status: 'stopped' } : x));
    toast(r.stopped ? `Stopped ${r.stopped} run${r.stopped > 1 ? 's' : ''}.` : 'Nothing was running.');
  }
  return (
    <div className="log">
      <h2>
        <span className={`live${anyRunning ? ' on' : ''}`} aria-hidden="true" />{title}
        {anyRunning && <button className="btn reject small stopall" onClick={(e) => stop(e)}>Stop all</button>}
      </h2>
      {notice && runs.length > 0 && (
        <div className="axis" aria-hidden="true">{Array.from({ length: Math.min(axisMin, 10) + 1 }, (_, i) => <span key={i}>{i === 0 ? '0' : `${Math.round((axisMin / Math.min(axisMin, 10)) * i)}m`}</span>)}</div>
      )}
      <div className="scroll">
        {runs.length === 0 && <div className="empty-line">No agent runs yet. Start a briefing below.</div>}
        {runs.map((r) => (
          <a key={r.id} className={`run ${r.status}`} href={`#/agents/${r.id}`}>
            <div className="top">
              <span className="a">{r.agent}{r.company ? ` · ${r.company}` : ''}</span>
              <span className="mono st">
                {r.status === 'running' ? 'running' : r.status === 'failed' || r.status === 'stopped' ? `${fmtClock(r.started_at)} · ${r.status}` : `${fmtClock(r.started_at)} · ${duration(r.duration_ms)}`}
              </span>
              {r.status === 'running' && <button className="stop" onClick={(e) => stop(e, r.id)} aria-label={`Stop ${r.agent}`}>Stop</button>}
            </div>
            {r.events.map((e) => (
              <div key={e.id} className={`ev ${e.type}`}>
                {e.type === 'tool' ? <><em>{e.text.split(' · ')[0]}</em>{e.text.includes(' · ') ? ' · ' + e.text.split(' · ').slice(1).join(' · ') : ''}</> : e.text}
              </div>
            ))}
            {r.status !== 'running' && r.summary && r.events.length === 0 && <div className="ev">{r.summary}</div>}
            {r.status === 'running' && <div className="bar"><div /></div>}
            {notice && <div className="durbar" aria-hidden="true"><i className={r.status === 'running' ? 'live' : r.status} style={{ width: `${Math.max(1.5, (elapsed(r) / (axisMin * 60000)) * 100)}%` }} /></div>}
          </a>
        ))}
      </div>
      <div className="runbar">
        <button className="btn ghost small" disabled={!!starting} onClick={() => start('briefing')}>
          {starting === 'briefing' ? <span className="spin" /> : null}Run briefing
        </button>
        <button className="btn ghost small" disabled={!!starting} onClick={() => start('scout')}>Scout only</button>
        <button className="btn ghost small" disabled={!!starting} onClick={() => start('tailor')}>Tailor shortlisted</button>
      </div>
    </div>
  );
}
