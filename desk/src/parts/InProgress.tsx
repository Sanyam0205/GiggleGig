import type { MatchRow } from '../api';
import { ago } from '../api';
import { LANES, justMoved, laneOf, nextStep } from './lanes';

/** What agents are doing to your jobs right now, and what moved recently, so a click never makes a job vanish. */
export function InProgress({ jobs }: { jobs: MatchRow[] }) {
  const busy = jobs.filter((j) => j.status === 'evaluating' || j.status === 'tailoring');
  const moved = jobs.filter((j) => !busy.includes(j) && justMoved(j.updated_at) && j.status !== 'sourced');
  if (!busy.length && !moved.length) return null;
  return (
    <section className="inprogress" aria-label="Being worked on">
      <h2 className="section">Being worked on<span className="c">{busy.length} running · {moved.length} moved in the last 15 min</span><a className="small" href="#/review">Open Review</a></h2>
      {[...busy, ...moved].slice(0, 8).map((j) => {
        const lane = laneOf(j.status);
        return (
          <a key={j.id} className={`ip-row${busy.includes(j) ? ' busy' : ''}`} href={`#/today/job/${j.id}`}>
            {busy.includes(j) && <span className="spin inline" aria-hidden="true" />}
            <span className="ip-t"><b>{j.company}</b> · {j.title}</span>
            <span className="ip-lane">{lane.title}</span>
            <span className="ip-n">{nextStep(j)}</span>
            <span className="mono small muted">{ago(j.updated_at)}</span>
          </a>
        );
      })}
    </section>
  );
}

export const laneTitle = (status: string) => (LANES.find((l) => l.statuses.includes(status)) ?? LANES[0]).title;
