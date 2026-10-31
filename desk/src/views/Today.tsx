import type { Today as TodayData } from '../api';
import { ago } from '../api';
import { Slip } from '../parts/Slip';
import { DispatchLog } from '../parts/DispatchLog';
import { consignment, KIND_LABEL, KIND_MINUTES, mostUrgent, fmtClock } from '../parts/postal';
import { NoticeList } from '../parts/Notice';
import { InProgress } from '../parts/InProgress';
import { getWorld } from '../world';
import { Wall } from '../parts/Tiles';
import type { MatchRow } from '../api';

const STAGE_LABEL: Record<string, string> = {
  sourced: 'to score', shortlisted: 'shortlisted', 'needs-referral': 'need a referral', 'awaiting-approval': 'awaiting you', applied: 'applied', interviewing: 'interviewing',
};

const BUDGET_MIN = 25;

/** Notice board Today: this week's drives (matches) first, then the shortlist awaiting your sign-off within a time budget. */
function NoticeToday({ data }: { data: TodayData }) {
  const dateline = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const open = data.queue.filter((q) => q.status === 'pending' || q.status === 'approved');
  const mins = open.map((q) => ({ q, m: KIND_MINUTES[q.kind] ?? 5 }));
  const used = mins.reduce((n, x) => n + x.m, 0);
  const signed = mins.filter((x) => x.q.status === 'approved').reduce((n, x) => n + x.m, 0);
  const meeting = data.newMatches.length;
  return (
    <>
      <header className="head">
        <h1>Drives this week</h1>
        <span className="meta">
          {dateline} · {meeting} new role{meeting === 1 ? '' : 's'} meet the cut-off
          {data.lastBriefing ? ` · last briefing ${ago(data.lastBriefing.ended_at ?? data.lastBriefing.started_at)}` : ''}
        </span>
      </header>
      <div className="grid12 today">
        <section className="main" aria-label="Drives and shortlist">
          <InProgress jobs={data.recent ?? []} />
          {meeting === 0
            ? <div className="counter-empty"><h3>No new drives posted.</h3><p>The fast lane checks for fresh roles every 90 minutes; anything that meets your cut-off is posted here and pinged to your phone.</p></div>
            : <NoticeList rows={data.newMatches as unknown as MatchRow[]} base="#/today" />}
          <p className="muted small" style={{ marginTop: 6 }}><a href="#/matches">All matches</a> · <a href="#/companies">Search a company</a></p>

          <h2 className="section" style={{ marginTop: 18 }}>
            Shortlist — awaiting your sign-off
            <span className="c">{open.length} slip{open.length === 1 ? '' : 's'} · {used} of {BUDGET_MIN} minutes</span>
          </h2>
          {open.length > 0 && (
            <div className="budget" aria-label={`Time budget: ${used} of ${BUDGET_MIN} minutes`}>
              <span>Today: {BUDGET_MIN} min</span>
              <div className="bar-track">
                <i className="done" style={{ width: `${Math.min(100, (signed / BUDGET_MIN) * 100)}%` }} />
                <i className="todo" style={{ width: `${Math.max(0, Math.min(100, ((Math.min(used, BUDGET_MIN) - signed) / BUDGET_MIN) * 100))}%` }} />
                {used > BUDGET_MIN && <i className="over" style={{ width: '4%' }} />}
              </div>
              <span className="mono">{used <= BUDGET_MIN ? `${BUDGET_MIN - used} min free` : `${used - BUDGET_MIN} min over: the rest can wait for tomorrow`}</span>
            </div>
          )}
          {open.length === 0 && <div className="counter-empty"><h3>Nothing awaiting sign-off.</h3><p>Press Tailor resume on a drive above; the tailored resume and its reviews land here for your approval.</p></div>}
          {open.map((q) => <Slip key={q.id} q={q} base="#/today" />)}

          <div className="strip">
            <div className="box">
              <h3>Follow-ups due</h3>
              {data.scheduled.length === 0 && <div className="empty-line">None scheduled. Referral sequences add their nudges here.</div>}
              {data.scheduled.map((s) => <div key={s.id} className="li"><span>{s.title}</span><span className="mono">{ago(s.due_at)}</span></div>)}
            </div>
            <div className="box">
              <h3>Next interview</h3>
              {data.interviews.length === 0 && <div className="empty-line">No interviews on the calendar yet.</div>}
              {data.interviews.map((i) => (
                <div key={i.id} className="li">
                  <span><b>{i.company ?? 'Interview'}</b> · {i.round ?? 'round'}</span>
                  <span className="mono">{i.scheduled_at ? new Date(i.scheduled_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <aside aria-label="Agent register"><DispatchLog title="Agent register" /></aside>
      </div>
    </>
  );
}

export function Today({ data }: { data: TodayData | null }) {
  if (data && getWorld() === 'notice') return <NoticeToday data={data} />;
  if (!data) return <div className="head"><h1>Needs you today</h1><span className="meta">Loading the counter…</span></div>;
  const urgent = mostUrgent(data.queue);
  const rest = data.queue.filter((q) => q.id !== urgent?.id);
  const pending = data.queue.filter((q) => q.status === 'pending');
  const kinds = Object.entries(pending.reduce<Record<string, number>>((m, q) => ((m[q.kind] = (m[q.kind] ?? 0) + 1), m), {}));
  const stage = (s: string) => data.stages.find((x) => x.status === s)?.n ?? 0;
  const dateline = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <>
      <header className="head">
        <h1>Needs you today</h1>
        <span className="meta">
          {dateline}
          {data.lastBriefing ? ` · last briefing ${ago(data.lastBriefing.ended_at ?? data.lastBriefing.started_at)} · ${data.lastBriefing.summary}` : ' · no briefing yet'}
        </span>
      </header>

      <div className="grid12 today">
        <section className="main" aria-label="Approval queue">
          <InProgress jobs={data.recent ?? []} />
          {urgent && (
            <button className="plate" onClick={() => { window.location.hash = `#/today/slip/${urgent.id}`; }}>
              <span className="t">{urgent.kind === 'application' ? `${urgent.job_title} — ${urgent.company}` : urgent.title}</span>
              <span className="go">Review</span>
              <span className="s">
                {KIND_LABEL[urgent.kind]}{urgent.fit_score != null ? ` · fit ${urgent.fit_score}` : ''} · booked {ago(urgent.created_at)}
                <span className="mono"> · {consignment(urgent)}</span>
              </span>
            </button>
          )}

          <h2 className="section">
            Booking slips
            <span className="c">{kinds.length ? kinds.map(([k, n]) => `${n} ${(KIND_LABEL[k] ?? k).toLowerCase()}${n > 1 ? 's' : ''}`).join(' · ') : 'nothing waiting'}</span>
          </h2>

          {data.queue.length === 0 && (
            <div className="counter-empty">
              <h3>The counter is clear.</h3>
              <p>
                Agents book a slip here whenever they finish a tailored resume or draft outreach. Nothing leaves without your stamp.
                {stage('shortlisted') > 0 ? ` ${stage('shortlisted')} shortlisted roles are ready to tailor.` : ' Run a briefing to source and score new roles.'}
              </p>
            </div>
          )}
          {rest.map((q) => <Slip key={q.id} q={q} base="#/today" />)}

          <div className="strip">
            <div className="box">
              <h3>Follow-ups due</h3>
              {data.scheduled.length === 0 && <div className="empty-line">None scheduled. Referral sequences add their nudges here.</div>}
              {data.scheduled.map((s) => (
                <div key={s.id} className="li"><span>{s.title}</span><span className="mono">{ago(s.due_at)}</span></div>
              ))}
            </div>
            <div className="box">
              <h3>Next interview</h3>
              {data.interviews.length === 0 && <div className="empty-line">No interviews on the calendar yet.</div>}
              {data.interviews.map((i) => (
                <div key={i.id} className="li">
                  <span><b>{i.company ?? 'Interview'}</b> · {i.round ?? 'round'}</span>
                  <span className="mono">{i.scheduled_at ? new Date(i.scheduled_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
            </div>
          </div>

          {getWorld() === 'wall' ? (
            <Wall base="#/today" rows={[{ key: 'new', title: 'New matches', sub: 'scored and waiting for you', rows: data.newMatches as unknown as MatchRow[], more: { label: 'All matches', href: '#/matches' } }]} />
          ) : (
          <div className="box" style={{ marginTop: 8 }}>
            <h3>New matches <a className="more" href="#/matches">All matches</a></h3>
            {data.newMatches.length === 0 && <div className="empty-line">No scored matches waiting. {stage('sourced') > 0 ? `${stage('sourced')} roles are queued for the scorer.` : ''}</div>}
            {data.newMatches.map((j) => (
              <div key={j.id} className="li">
                <a href={`#/today/job/${j.id}`}><b className="num">{j.fit_score ?? '—'}</b> · {j.title} — {j.company}</a>
                <span className="mono">{STAGE_LABEL[j.status] ?? j.status} · {fmtClock(j.first_seen)}</span>
              </div>
            ))}
          </div>
          )}
        </section>

        <aside aria-label="Agent activity"><DispatchLog /></aside>
      </div>
    </>
  );
}
