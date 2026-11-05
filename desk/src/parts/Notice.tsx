import type { MatchRow } from '../api';

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

