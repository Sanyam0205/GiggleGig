import { fmtClock, fmtStampDate } from './postal';

/** The violet circular date stamp an item receives when you approve it — the desk's one signature. */
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
