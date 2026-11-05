import type { MatchRow, Today as TodayData } from '../api';
import { api, ago } from '../api';
import { useToast } from '../App';
import { Slip } from '../parts/Slip';
import { DispatchLog } from '../parts/DispatchLog';
import { InProgress } from '../parts/InProgress';
import { ClassifiedList } from '../parts/Classified';

/** What needs you now: CVs waiting for sign-off, roles that are being worked on, the newest strong matches, what is due. */
export function Today({ data }: { data: TodayData | null }) {
  const toast = useToast();
  const dateline = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  if (!data) return <header className="head"><h1>Today</h1><span className="meta">{dateline}</span></header>;
  const open = data.queue.filter((q) => q.status === 'pending' || q.status === 'approved');
  async function search() {
    try { await api.start('scout'); toast('Searching every source. Roles appear on Review as each finishes.'); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <header className="head">
        <h1>Today</h1>
        <span className="meta">
          {dateline} · {open.length} waiting for you · {data.newMatches.length} new match{data.newMatches.length === 1 ? '' : 'es'}
          {data.lastBriefing ? ` · last search ${ago(data.lastBriefing.ended_at ?? data.lastBriefing.started_at)}` : ''}
        </span>
        <span className="sp" />
        <button className="btn frank" onClick={search}>Search now</button>
      </header>
      <div className="today-grid">
        <div className="today-main">
          <InProgress jobs={data.recent ?? []} />
          <h2 className="section">Waiting for you<span className="c">CVs and messages ready for your sign-off; nothing leaves without it</span></h2>
          {open.length === 0
            ? <div className="counter-empty"><h3>Nothing waiting.</h3><p>Pick roles on Review and press Tailor CV. The CV, its three reviews and the apply link land here for your approval.</p><a className="btn ghost small" href="#/review">Open Review</a></div>
            : open.map((q) => <Slip key={q.id} q={q} base="#/today" />)}

          <h2 className="section" style={{ marginTop: 10 }}>New matches<span className="c"><a href="#/review">All of them on Review</a></span></h2>
          {data.newMatches.length === 0
            ? <div className="empty-line">No new matches since the last search.</div>
            : <ClassifiedList rows={data.newMatches.slice(0, 6) as unknown as MatchRow[]} base="#/today" />}

          <div className="strip">
            <div className="box">
              <h3>Follow-ups due</h3>
              {data.scheduled.length === 0 && <div className="empty-line">None scheduled. Referral asks add their nudges here.</div>}
              {data.scheduled.map((s) => <div key={s.id} className="li"><span>{s.title}</span><span className="mono">{ago(s.due_at)}</span></div>)}
            </div>
            <div className="box">
              <h3>Next interview<a className="more" href="#/applications">Applications</a></h3>
              {data.interviews.length === 0 && <div className="empty-line">No interviews on the calendar yet.</div>}
              {data.interviews.map((i) => (
                <div key={i.id} className="li">
                  <span><b>{i.company ?? 'Interview'}</b> · {i.round ?? 'round'}</span>
                  <span className="mono">{i.scheduled_at ? new Date(i.scheduled_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside aria-label="Agent register"><DispatchLog title="Agent register" /></aside>
      </div>
    </>
  );
}
