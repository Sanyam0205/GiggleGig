import { useEffect, useState } from 'react';
import { api, duration, useStream, type Run, type RunEvent } from '../api';
import { fmtClock } from './postal';
import { useToast } from '../App';

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
      <div className="scroll">
        {runs.length === 0 && <div className="empty-line">No agent runs yet.</div>}
        {runs.map((r) => (
          <a key={r.id} className={`run ${r.status}`} href={`#/agents/${r.id}`}>
            <div className="top">
              <span className="a">{agentName(r.agent)}{r.company ? ` · ${r.company}` : ''}</span>
              <span className="mono st">
                {r.status === 'running' ? 'running' : r.status === 'failed' || r.status === 'stopped' ? `${fmtClock(r.started_at)} · ${r.status}` : `${fmtClock(r.started_at)} · ${duration(r.duration_ms)}`}
              </span>
              {r.status === 'running' && <button className="stop" onClick={(e) => stop(e, r.id)} aria-label={`Stop ${agentName(r.agent)}`}>Stop</button>}
            </div>
            {r.events.map((e) => (
              <div key={e.id} className={`ev ${e.type}`}>
                {(() => { const p = plainEvent(e.type, e.text); return p.verb ? <><em>{p.verb}</em>{p.rest ? ` · ${p.rest}` : ''}</> : p.rest; })()}
              </div>
            ))}
            {r.status !== 'running' && r.summary && r.events.length === 0 && <div className="ev">{plainEvent('log', r.summary).rest}</div>}
            {r.status === 'running' && <div className="bar"><div /></div>}
          </a>
        ))}
      </div>
      <div className="runbar">
        <button className="btn ghost small" disabled={!!starting} onClick={() => start('scout')}>
          {starting === 'scout' ? <span className="spin" /> : null}Search now
        </button>
        <a className="btn ghost small" href="#/agents">Every run</a>
      </div>
    </div>
  );
}

const AGENTS: Record<string, string> = {
  intake: 'Reading your resume', 'setup-context': 'Building your profile', scout: 'Search', 'scout:gmail': 'Search · job-alert emails',
  'scout:firecrawl': 'Search · career sites and boards', 'scout:web': 'Search · the open web', 'scout:company': 'Company search',
  triage: 'Quick review', evaluate: 'Evaluation', 'evaluate:batch': 'Evaluation', tailor: 'Tailoring a CV', 'jd:firecrawl': 'Fetching job descriptions',
  inbox: 'Hiring email', briefing: 'Briefing', fastlane: 'Fresh postings', rescreen: 'Review again',
};
/** Agent names as the desk says them: "Quick review", "Company search · Amazon". */
export function agentName(a: string) {
  if (AGENTS[a]) return AGENTS[a];
  const [head, rest] = a.split(':');
  if (head === 'company') return `Company search · ${rest}`;
  return AGENTS[head] ?? a.replace(/[-:]/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

const TOOLS: [RegExp, string][] = [
  [/firecrawl_search|WebSearch/i, 'Searched the web'], [/firecrawl_scrape|WebFetch/i, 'Read a page'], [/firecrawl_(agent|crawl|map)/i, 'Browsed a site'],
  [/firecrawl_extract/i, 'Read listings'], [/gmail.*(search|list)/i, 'Searched your email'], [/gmail/i, 'Read an email'], [/calendar/i, 'Checked your calendar'], [/^StructuredOutput$/, 'Wrote up the result'], [/^(Agent|Task)$/, 'Asked a reviewer'],
  [/^Read$/, 'Read'], [/^(Write|Edit)$/, 'Saved'], [/^(Grep|Glob)$/, 'Looked through files'], [/^Bash$/, ''], [/^mcp\./, 'Used a connected tool'],
];
const shortUrl = (s: string) => s.replace(/^https?:\/\/(www\.)?/, '').replace(/\?.*$/, '').slice(0, 70);

/** Raw tool and engine lines turned into the desk's own words. Unknown lines pass through untouched. */
export function plainEvent(type: string, text: string): { verb?: string; rest: string } {
  if (type === 'tool') {
    const [tool, ...more] = text.split(' · ');
    const rest = more.join(' · ');
    const hit = TOOLS.find(([re]) => re.test(tool));
    if (!hit) return { verb: tool, rest };
    if (hit[1] === '') return { verb: rest || 'Ran a step', rest: '' };
    return { verb: hit[1], rest: /^https?:/.test(rest) ? shortUrl(rest) : hit[1] === 'Read' || hit[1] === 'Saved' ? rest.split('/').pop() ?? rest : rest };
  }
  const tri = text.trim().match(/^[0-9a-f]{8,}\s+TRIAGE:\s*(\w+)\s*\|\s*([^\n]*)/i);
  if (tri) {
    const more = text.trim().split('\n').length - 1;
    return { verb: `Quick review: ${tri[1].toLowerCase()}`, rest: tri[2].split(/\s*\|\s*/).filter(Boolean).join(' · ') + (more > 0 ? ` (and ${more} more)` : '') };
  }
  const plain = text
    .replace(/^Triage of (\d+) role\(s\) in \d+ batch\(es\), threshold ([\d.]+)/, 'Reviewing $1 roles; $2 out of 5 passes')
    .replace(/^Full A–G evaluation of (\d+) role\(s\)/, 'Evaluating $1 role(s) in full')
    .replace(/^nothing to triage$/, 'Nothing new to review');
  return { rest: plain };
}
