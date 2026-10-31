import { useEffect, useState } from 'react';
import { api, ago, formatPay, useStream } from '../api';
import { useToast } from '../App';
import { Icon } from '../parts/Icon';
import { Kit } from '../parts/Kit';
import { ResumeFrame } from '../parts/ResumeFrame';
import { Markdown } from '../parts/Markdown';
import { Eligibility } from '../parts/Notice';
import { laneOf } from '../parts/lanes';

const MOVES = ['shortlisted', 'needs-referral', 'applied', 'referral-pending', 'referred', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'skipped'];
const DIMS: [string, string][] = [['stack', 'Stack'], ['level', 'Level'], ['domain', 'Domain'], ['company', 'Company'], ['logistics', 'Logistics']];
const LOCKED = ['tailoring', 'approved', 'applied', 'interviewing', 'offer', 'accepted'];

export function JobSheet({ id, back }: { id: string; back: string }) {
  const toast = useToast();
  const [job, setJob] = useState<any>(null);
  const [tab, setTab] = useState<'report' | 'jd' | 'resume' | 'kit'>('jd');
  const [notes, setNotes] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api.job(id).then((j) => { setJob(j); if (j.engine?.markdown) setTab((t) => (t === 'jd' ? 'report' : t)); }).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [id]);
  useStream((m) => { if (m.jobsChanged || m.queueChanged) load(); });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') window.location.hash = back; };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);
  if (!job) return null;
  const fit = job.fit;
  const pay = formatPay(job.salary_min, job.salary_max, job.currency) ?? (fit?.salary ? `${formatPay(fit.salary.min, fit.salary.max, fit.salary.currency)} (estimate)` : null);
  const eng = job.engine;
  const cvHtml = eng?.cv?.html ?? job.html;
  const cvPdf = eng?.cv?.pdf ?? job.pdf;
  const hasResume = Boolean(cvHtml || job.files['resume.md']);

  async function act(key: string, fn: () => Promise<unknown>, msg: string) {
    setBusy(key);
    try { await fn(); toast(msg); } catch (e: any) { toast(e.message, true); } finally { window.setTimeout(() => setBusy(null), 1200); }
  }

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={job.title}>
      <button className="scrim" aria-label="Close" onClick={() => { window.location.hash = back; }} />
      <div className="sheet">
        <div className="top">
          <div>
            <div className="label muted">
              <a href={`#/pipeline/${laneOf(job.status).key}`}>Pipeline · {laneOf(job.status).title}</a> · {job.status.replace(/-/g, ' ')} · <span className="mono">{job.id}</span>
            </div>
            <h2>{job.title} — {job.company}</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              {job.location ?? 'Location n/a'}{job.remote ? ' · remote' : ''}{pay ? ` · ${pay}` : ''} · found {ago(job.first_seen)} via {job.sources.join(', ')}
            </div>
          </div>
          <span className="sp" />
          <a className="iconbtn" href={back} aria-label="Close"><Icon name="close" size={18} /></a>
        </div>

        <div className="actions">
          {job.apply_url && <a className="btn ghost" href={job.apply_url} target="_blank" rel="noreferrer"><Icon name="open" size={16} />Posting</a>}
          {cvPdf && <a className="btn ghost" href={cvPdf} target="_blank" rel="noreferrer"><Icon name="doc" size={16} />CV PDF</a>}
          <a className="btn ghost" href={`#/companies/${encodeURIComponent(job.company)}`}>All roles at {job.company}</a>
          <span className="sp" />
          <select className="field" value="" onChange={(e) => e.target.value && act('move', () => api.setStatus(id, e.target.value, 'set on desk'), `Moved to ${e.target.value.replace(/-/g, ' ')}.`)} aria-label="Move to stage">
            <option value="">Move to…</option>
            {MOVES.filter((m) => m !== job.status).map((m) => <option key={m} value={m}>{m.replace(/-/g, ' ')}</option>)}
          </select>
        </div>

        {!eng && job.status !== 'evaluating' && (
          <section className="tailor-box">
            <h3>Evaluate this role</h3>
            <p className="muted small">{job.triage ? `Triage ${job.triage.verdict} · ${job.triage.score}/5 · ${job.triage.reason}` : 'Not triaged yet.'} The full A–G evaluation writes a report: requirement-by-requirement CV match, level strategy, comp, interview plan and posting legitimacy, scored 1–5.</p>
            <div className="row-actions">
              {job.triage?.blocked && <textarea className="msg short" placeholder={job.triage.blocked} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Your answer" />}
              <button className="btn frank" disabled={busy === 'eval' || (job.triage?.blocked && !answer.trim())} onClick={() => act('eval', () => api.evaluate(id, answer.trim() || undefined), 'Evaluating. It now sits in Pipeline → Being worked on; this sheet updates when the report lands.')}>{busy === 'eval' ? <span className="spin" /> : null}Evaluate (A–G)</button>
              <span className="muted small">About 3–6 minutes.</span>
            </div>
          </section>
        )}
        {job.status === 'evaluating' && <p className="notice small">Evaluation in progress: see the agent register.</p>}

        {eng && (
          <section>
            <h3>
              Role evaluation {eng.score != null ? `${Number(eng.score).toFixed(1)} / 5` : ''}{' '}
              {eng.decision && <span className={`tag ${eng.decision === 'Apply' ? 'violet' : eng.decision === 'Skip' ? 'red' : 'ink'}`}>{eng.decision}</span>}{' '}
              {eng.confidence && <span className="muted small">{eng.confidence} confidence</span>}{' '}
              {eng.legitimacy && <span className={`tag ${eng.legitimacy === 'High Confidence' ? 'ink' : 'red'}`}>{eng.legitimacy}</span>}
            </h3>
            <Eligibility j={job.engineRow ?? { eligibility: (eng.summary?.requirement_importance ?? []).filter((r: any) => ['critical', 'high'].includes(r.importance)).slice(0, 6).map((r: any) => ({ criterion: String(r.requirement).slice(0, 48), status: r.match === 'strong' ? 'met' : r.match === 'missing' ? 'unmet' : 'unknown' })), dimensions: null }} />
            {eng.summary?.top_strengths?.length > 0 && <p style={{ marginTop: 8 }}><b>Strengths:</b> {eng.summary.top_strengths.join(' · ')}</p>}
            {eng.summary?.hard_stops?.length > 0 && <p className="notice small" style={{ marginTop: 6 }}><b>Hard stops:</b> {eng.summary.hard_stops.join(' · ')}</p>}
            {eng.summary?.soft_gaps?.length > 0 && <p className="muted small" style={{ marginTop: 6 }}>Gaps: {eng.summary.soft_gaps.join(' · ')}</p>}
            {eng.summary?.next_action && <p className="small" style={{ marginTop: 6 }}><b>Next:</b> {eng.summary.next_action}</p>}
            <p className="muted small" style={{ marginTop: 6 }}>Report #{eng.report} · {eng.archetype} · tracker status {eng.status ?? 'Evaluated'}{eng.summary?.advertised_comp ? ` · posted comp ${eng.summary.advertised_comp}` : ''}</p>
          </section>
        )}

        {eng && !LOCKED.includes(job.status) ? (
          <section className="tailor-box">
            <h3>{hasResume ? 'Re-tailor the resume' : 'Tailor a resume for this role'}</h3>
            <textarea className="msg short" placeholder="Optional instructions, e.g. lead with the LLM retrieval work; keep BT to one line; position for backend, not AI"
              value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Tailoring instructions" />
            <div className="row-actions">
              <button className="btn frank" disabled={busy === 'tailor'} onClick={() => act('tailor', () => api.tailor(id, notes || undefined), 'Tailoring. It now sits in Pipeline → Being worked on, then Waiting for you on Today.')}>
                {busy === 'tailor' ? <span className="spin" /> : null}{hasResume ? 'Re-tailor' : 'Tailor resume'}
              </button>
              <span className="muted small">Agents compare the role with the candidate profile, tailor a resume, check its claims, and prepare a one-page PDF. Usually 5–10 minutes.</span>
            </div>
          </section>
        ) : job.status === 'tailoring' ? <p className="notice small">Tailoring in progress — see the dispatch log.</p> : null}

        {fit && !eng && (
          <section>
            <h3>Legacy fit {fit.score}/100 <span className={`tag ${fit.verdict === 'apply' ? 'violet' : fit.verdict === 'skip' ? 'ink' : 'red'}`}>{fit.verdict}</span></h3>
            <div className="dims">
              {DIMS.map(([k, label]) => (
                <div key={k} className="dim">
                  <div className="label muted">{label}</div>
                  <div className="v">{fit.dimensions?.[k] ?? '—'}</div>
                  <div className="meter"><div style={{ width: `${fit.dimensions?.[k] ?? 0}%` }} /></div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 10 }}>{fit.rationale}</p>
            {fit.hardConstraintFailed && <p className="notice" style={{ marginTop: 8 }}>Hard constraint: {fit.hardConstraintFailed}</p>}
            {fit.redFlags?.length > 0 && <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>Red flags: {fit.redFlags.join(' · ')}</p>}
          </section>
        )}

        <section>
          <h3>Warm paths at {job.company}</h3>
          {job.warmPaths.length === 0
            ? <p className="muted small">No connections here yet. Import your LinkedIn connections on the Contacts tab, or run <span className="mono">/connection-request {job.company}</span>.</p>
            : job.warmPaths.slice(0, 6).map((c: any) => (
              <div key={c.id} className="li">
                <span>{c.linkedin ? <a href={c.linkedin} target="_blank" rel="noreferrer">{c.name}</a> : c.name}<span className="sub block">{c.role ?? ''} · {c.relationship}</span></span>
                <button className="btn ghost small" disabled={busy === `ref${c.id}`} onClick={() => act(`ref${c.id}`, () => api.referral(id, c.id), `Drafting a referral ask to ${c.name} — it lands on Today.`)}>Draft referral ask</button>
              </div>
            ))}
        </section>

        <section>
          <div className="tabs" role="tablist">
            {eng?.markdown && <button role="tab" aria-selected={tab === 'report'} onClick={() => setTab('report')}>Report A–H</button>}
            <button role="tab" aria-selected={tab === 'jd'} onClick={() => setTab('jd')}>Job description</button>
            {hasResume && <button role="tab" aria-selected={tab === 'resume'} onClick={() => setTab('resume')}>Tailored resume</button>}
            <button role="tab" aria-selected={tab === 'kit'} onClick={() => setTab('kit')}>Application kit</button>
          </div>
          {tab === 'report' && eng?.markdown && <div className="paper report"><Markdown text={eng.markdown} /></div>}
          {tab === 'jd' && <div className="paper jd">{job.description ?? 'No description captured.'}</div>}
          {tab === 'resume' && <ResumeFrame html={cvHtml} md={job.files['resume.md']} stamp={job.updated_at} />}
          {tab === 'kit' && (job.kit ? <Kit kit={job.kit} /> : (
            <div className="counter-empty">
              <h3>No application kit yet.</h3>
              <p>The kit reads the real application form when the board exposes it, then drafts every answer from your Q&amp;A file and experience: notice period, CTC, why this company, custom questions.</p>
              <button className="btn frank" disabled={busy === 'kit'} onClick={() => act('kit', () => api.kit(id), 'Preparing the application kit…')}>Prepare application kit</button>
              <p className="muted small">To fill the form in Chrome for you, run <span className="mono">/apply-assist {id}</span> in Claude Code (needs the Claude in Chrome extension). It stops before Submit.</p>
            </div>
          ))}
        </section>

        <section>
          <h3>History</h3>
          <ol className="history">
            {job.history.map((h: any, i: number) => <li key={i}><span className="mono muted">{ago(h.ts)}</span><span>{h.status.replace(/-/g, ' ')}</span><span className="muted">{h.note}</span></li>)}
            {job.history.length === 0 && <li><span className="muted">Sourced {ago(job.first_seen)}; no moves yet.</span></li>}
          </ol>
        </section>
        {job.runs.length > 0 && (
          <section>
            <h3>Agent runs</h3>
            {job.runs.map((r: any) => <div key={r.id} className="li"><a href={`#/agents/${r.id}`}>{r.agent} · {r.status}</a><span className="mono">{ago(r.started_at)}</span></div>)}
          </section>
        )}
      </div>
    </div>
  );
}
