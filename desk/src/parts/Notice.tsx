import { api, formatPay, type MatchRow } from '../api';
import { useToast } from '../App';
import { platformName } from '../views/Matches';

const IN_FLIGHT = ['tailoring', 'awaiting-approval', 'approved', 'applied', 'referral-pending', 'referred', 'interviewing', 'offer', 'accepted'];
const DIM_LABEL: Record<string, string> = { stack: 'Stack', level: 'Level', domain: 'Domain', company: 'Company', logistics: 'Location & pay' };

/** Ink tick, maroon cross, or a grey query for "the posting doesn't say". */
function Mark({ status }: { status: 'met' | 'unmet' | 'unknown' }) {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {status === 'met' && <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" />}
      {status === 'unmet' && <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" />}
      {status === 'unknown' && <path d="M5.2 5.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M7 10.6v.1" stroke="currentColor" />}
    </svg>
  );
}

/** The eligibility row: the scorer's checks, or (for roles scored before checks existed) its five dimensions as pass/fail. */
export function Eligibility({ j }: { j: Pick<MatchRow, 'eligibility' | 'dimensions'> }) {
  const items = j.eligibility?.length
    ? j.eligibility
    : Object.entries(((j as any).dimensions ?? {}) as Record<string, number>).map(([k, v]) => ({ criterion: `${DIM_LABEL[k] ?? k} ${v}`, status: (v >= 60 ? 'met' : 'unmet') as 'met' | 'unmet' }));
  if (!items.length) return null;
  return (
    <ul className="elig" aria-label="Eligibility">
      {items.map((e, i) => (
        <li key={i} className={e.status}>
          <Mark status={e.status} />
          <span>{e.criterion}</span>
          <span className="sr-only">{e.status === 'met' ? 'meets' : e.status === 'unmet' ? 'does not meet' : 'not stated'}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bold-marked evidence sentence, rendered without dangerouslySetInnerHTML. */
function Evidence({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <p className="proof">{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</p>;
}

/** Roles posted like campus drive notices: score, title, eligibility, the evidence line, pay and the action. */
export function NoticeList({ rows, base }: { rows: MatchRow[]; base: string }) {
  const toast = useToast();
  async function tailor(id: string) {
    try { await api.tailor(id); toast('Tailoring started. The job is now in Pipeline → Being worked on, and moves to Waiting for you when the CV is ready.'); }
    catch (e: any) { toast(e.message, true); }
  }
  async function evaluate(id: string) {
    try { await api.evaluate(id); toast('Evaluating. The job is now in Pipeline → Being worked on, then Ready to decide (or Closed if it scores below 3.5).'); }
    catch (e: any) { toast(e.message, true); }
  }
  return (
    <div className="notices">
      {rows.map((j) => {
        const posted = formatPay(j.salary_min, j.salary_max, j.currency) ?? j.advertisedComp ?? null;
        const est = !posted && j.salaryEst ? formatPay(j.salaryEst.min, j.salaryEst.max, j.salaryEst.currency) : null;
        const sources = [...new Set<string>(JSON.parse(j.sources).map(platformName))];
        return (
          <article key={j.id} className="notice-entry">
            {j.score5 != null
              ? <div className="score num">{j.score5.toFixed(1)}<small>of 5</small></div>
              : j.triage
                ? <div className="score num provisional" title="Preliminary role review">{j.triage.score.toFixed(1)}<small>triage</small></div>
                : <div className="score num">{j.fit_score ?? '—'}<small>fit</small></div>}
            <div className="nbody">
              <a className="nt" href={`${base}/job/${j.id}`}>{j.title}</a>
              <div className="co">{j.company} · {j.location ?? 'Location n/a'}{j.remote ? ' · remote' : ''}{j.warm ? ` · you know ${j.warm} there` : ''}</div>
              {(j.decision || j.legitimacy || j.confidence) && (
                <div className="verdict-row">
                  {j.decision && <span className={`tag ${j.decision === 'Apply' ? 'violet' : j.decision === 'Skip' ? 'red' : 'ink'}`}>{j.decision}</span>}
                  {j.confidence && <span className="muted small">{j.confidence} confidence</span>}
                  {j.legitimacy && j.legitimacy !== 'High Confidence' && <span className="tag red">{j.legitimacy}</span>}
                  {j.report_num && <a className="small" href={`${base}/job/${j.id}`}>Report #{j.report_num}</a>}
                </div>
              )}
              {!j.report_num && j.triage && <p className="proof">Triage {j.triage.verdict}: {j.triage.reason}</p>}
              <Eligibility j={j} />
              {j.evidence ? <Evidence text={j.evidence} /> : j.rationale ? <p className="proof">{j.rationale}</p> : null}
            </div>
            <div className="nside">
              {posted ? <span className="pay">{posted} <em>posted</em></span> : est ? <span className="pay">{est} <em>estimate</em></span> : null}
              <span className="via">via {sources.join(' · ')}</span>
              {IN_FLIGHT.includes(j.status) || j.status === 'evaluating'
                ? <span className="tag violet">{j.status.replace(/-/g, ' ')}</span>
                : !j.report_num
                  ? <button className="btn small ghost" onClick={() => evaluate(j.id)}>Evaluate (A–G)</button>
                  : <button className={`btn small ${(j.score5 ?? 0) >= 4 ? 'frank' : 'ghost'}`} onClick={() => tailor(j.id)}>Tailor CV</button>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
