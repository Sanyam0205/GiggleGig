import { fmtClock, fmtStampDate } from './postal';

/** The red "Approved" stamp an item receives when you approve it. */
export function Stamp({ at, fresh = false, label = 'DESK' }: { at?: string | null; fresh?: boolean; label?: string }) {
  return (
    <div className={`stamp${fresh ? ' fresh' : ''}`} role="img" aria-label={`Franked ${fmtStampDate(at)} ${fmtClock(at)}`}>
      <div>
        <b>{label}</b>
        {fmtStampDate(at)}
        <br />
        {fmtClock(at)}
      </div>
    </div>
  );
}
