import type { TrackStep } from './postal';
import { fmtClock } from './postal';

export function Track({ steps }: { steps: TrackStep[] }) {
  return (
    <ol className="track" aria-label="Tracking">
      {steps.map((s, i) => (
        <li key={s.label} className={s.done ? 'done' : ''}>
          {i > 0 && <span className="ln" aria-hidden="true" />}
          <i aria-hidden="true" />
          {s.label}
          {s.done && s.at ? <span className="at">{fmtClock(s.at)}</span> : null}
        </li>
      ))}
    </ol>
  );
}
