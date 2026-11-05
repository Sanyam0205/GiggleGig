import { formatPay, type MatchRow } from '../api';
import { platformName } from './platform';

/** One number for a role however far it got: the full evaluation, else the quick review, else the legacy 0–100 fit. */
export const fitOf = (j: MatchRow): number | null =>
  j.score5 ?? j.triage?.score ?? (j.fit_score != null ? j.fit_score / 20 : null);

/** The box's rule weight is its fit: the strongest roles are the heaviest boxes on the page. */
export const weightOf = (f: number | null) => (f == null ? 'w3' : f >= 4.5 ? 'w5' : f >= 4 ? 'w4' : 'w3');

const CLOSED = ['skipped', 'rejected', 'withdrawn'];
const BUSY: Record<string, string> = {
  evaluating: 'Evaluating', tailoring: 'Tailoring', 'awaiting-approval': 'CV ready', approved: 'Approved', applied: 'Applied',
  interviewing: 'Interviewing', offer: 'Offer',
};

export const isRemote = (j: MatchRow) => Boolean(j.remote) || /remote|anywhere|worldwide|work from home/i.test(j.location ?? '');

export function payOf(j: MatchRow) {
  return formatPay(j.salary_min, j.salary_max, j.currency) ?? j.advertisedComp ?? null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Where the role is, said once: "Remote · India", "Remote · Worldwide", "Bengaluru". Never "Remote · Remote only". */
export function placeOf(j: MatchRow) {
  const parts = (j.location ?? '').split(/[,/;|]+/).map((p) => p
    .replace(/[()[\]]/g, ' ')
    .replace(/\b(remote|only|work from home|wfh|hybrid|onsite|on-site)\b/gi, ' ')
    .replace(/\s+/g, ' ').replace(/^[-–·:\s]+|[-–·:\s]+$/g, '')).filter(Boolean);
  const seen = [...new Set(parts.map((p) => (p.length <= 3 || /^(apac|emea|latam)$/i.test(p) ? p.toUpperCase() : cap(p.toLowerCase() === p || p.toUpperCase() === p ? p.toLowerCase() : p))))];
  const place = seen.slice(0, 2).join(', ');
  const hybrid = /hybrid/i.test(j.location ?? '');
  if (isRemote(j)) return place ? `Remote · ${place}` : 'Remote';
  return [hybrid ? 'Hybrid' : null, place].filter(Boolean).join(' · ') || null;
}

/** Years the posting asks for, read from its own text ("2+ years", "1-3 yrs"); null when it doesn't say. */
export function yearsAsked(text?: string | null): { min: number; max?: number } | null {
  const m = (text ?? '').match(/(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+\w+){0,3}\s+experience|experience[^.\n]{0,30}?(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)/i);
  if (!m) return null;
  const min = Number(m[1] ?? m[3]); const max = m[2] ?? m[4];
  return min > 20 ? null : { min, max: max ? Number(max) : undefined };
}
export const yearsLabel = (y: { min: number; max?: number } | null) => (y ? (y.max ? `${y.min}–${y.max} yrs` : `${y.min}+ yrs`) : 'Not stated');

const OPEN_TO_INDIA = /india|worldwide|anywhere|global|apac|asia|emea/i;
const REGION_ONLY = /\b(us|usa|united states|canada|europe|eu|uk|united kingdom|germany|latam|americas|australia|new york|san francisco|california)\b/i;
const INDIA_CITY = /india|bengaluru|bangalore|mumbai|pune|hyderabad|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|kochi|jaipur|chandigarh|indore|coimbatore/i;

/** The checks a quick-reviewed role can be held to before a full evaluation: where, pay, years, description. */
export function quickChecks(j: MatchRow, description: string | null | undefined, rules: { floor?: number; experience?: string }) {
  const loc = j.location ?? '';
  const out: { criterion: string; status: 'met' | 'unmet' | 'unknown' }[] = [];
  if (isRemote(j)) out.push(OPEN_TO_INDIA.test(loc) ? { criterion: 'Remote, open to India', status: 'met' } : REGION_ONLY.test(loc) ? { criterion: `Remote, limited to ${placeOf(j)?.replace(/^Remote · /, '')}`, status: 'unmet' } : { criterion: 'Remote; the countries it hires in are not stated', status: 'unknown' });
  else out.push(INDIA_CITY.test(loc) ? { criterion: `Office in India (${placeOf(j)})`, status: 'met' } : loc ? { criterion: `Office outside India (${placeOf(j)})`, status: 'unmet' } : { criterion: 'Location not stated', status: 'unknown' });
  if (rules.floor) {
    const inr = (j.currency ?? 'INR').toUpperCase() === 'INR' ? (j.salary_max ?? j.salary_min) : null;
    const lpa = (rules.floor / 100000).toFixed(0);
    out.push(inr && inr >= 100000 ? { criterion: inr >= rules.floor ? `Pay reaches your ${lpa} LPA floor` : `Pay tops out below your ${lpa} LPA floor`, status: inr >= rules.floor ? 'met' : 'unmet' } : { criterion: payOf(j) ? `Pay stated as ${payOf(j)}; check it against ${lpa} LPA` : `Pay not stated; your floor is ${lpa} LPA`, status: 'unknown' });
  }
  const y = yearsAsked(description);
  const cap = Number((rules.experience ?? '').split(/[-–]/).pop()) || null;
  out.push(!y ? { criterion: 'Years of experience not stated', status: 'unknown' } : { criterion: `Asks ${yearsLabel(y)}${cap ? `; you are aiming at ${rules.experience} years` : ''}`, status: cap == null || y.min <= cap ? 'met' : 'unmet' });
  return out;
}

/** A description as paragraphs: keeps its own line breaks and restores the ones lost where sentences ran together. */
export function JdText({ text }: { text: string }) {
  const paras = text.replace(/\r/g, '')
    .replace(/([a-z0-9)%][.!?:])([A-Z][a-z])/g, '$1\n$2')
    .split(/\n\s*\n|\n(?=\s*[-•*▪]\s)|\n/).map((s) => s.trim()).filter(Boolean);
  return <div className="jd">{paras.map((p, i) => <p key={i} className={/^[-•*▪]\s/.test(p) ? 'li' : i === 0 && p.length <= 160 ? 'lede' : undefined}>{p.replace(/^[-•*▪]\s*/, '')}</p>)}</div>;
}

export function Classified({ j, selected, onOpen, picked, onPick }: {
  j: MatchRow; selected?: boolean; onOpen: () => void; picked?: boolean; onPick?: (on: boolean) => void;
}) {
  const fit = fitOf(j);
  const pay = payOf(j);
  const where = placeOf(j);
  const reason = j.report_num ? (j.rationale ?? j.nextAction) : j.triage?.reason ?? j.rationale;
  const sources = [...new Set<string>(JSON.parse(j.sources || '[]').map(platformName))];
  const jd = (j as any).jd_status as string | undefined;
  return (
    <div
      role="option"
      tabIndex={0}
      aria-selected={selected ?? false}
      className={`ad ${weightOf(fit)}${CLOSED.includes(j.status) ? ' closed' : ''}`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      data-id={j.id}
    >
      <div className="ad-head">
        <h2>{j.title}</h2>
        {onPick && (
          <input className="pick" type="checkbox" checked={picked ?? false} aria-label={`Pick ${j.title}`}
            onClick={(e) => e.stopPropagation()} onChange={(e) => onPick(e.target.checked)} />
        )}
      </div>
      <div className="by">{j.company}{sources.length ? <span> · via {sources.slice(0, 2).join(', ')}</span> : null}</div>
      {reason && <p>{reason}</p>}
      <div className="row">
        <span>{[where || 'Location not stated', pay].filter(Boolean).join(' · ')}</span>
        {fit != null && <span className="fit">{fit.toFixed(1)}<small>{j.report_num ? 'of 5' : 'review'}</small></span>}
      </div>
      {(BUSY[j.status] || j.decision || (jd && jd !== 'full') || CLOSED.includes(j.status)) && (
        <div className="flags">
          {BUSY[j.status] && <span className="tag violet">{BUSY[j.status]}</span>}
          {j.decision && <span className={`tag ${j.decision === 'Apply' ? 'red' : 'ink'}`}>{j.decision}</span>}
          {jd && jd !== 'full' && <span className="jd-flag">JD {jd === 'missing' ? 'not found' : 'incomplete'}</span>}
          {CLOSED.includes(j.status) && <span className="tag ink">{j.status}</span>}
        </div>
      )}
    </div>
  );
}

/** A column of classifieds that open the full job sheet (Today, company pages). */
export function ClassifiedList({ rows, base }: { rows: MatchRow[]; base: string }) {
  return (
    <div className="cols" role="listbox" aria-label="Roles">
      {rows.map((j) => <Classified key={j.id} j={j} onOpen={() => { window.location.hash = `${base}/job/${j.id}`; }} />)}
    </div>
  );
}
