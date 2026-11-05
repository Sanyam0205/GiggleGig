import { api, ago, useLive, type MatchRow } from '../api';
import { useToast } from '../App';
import { fitOf, payOf, placeOf } from '../parts/Classified';
import { Interviews } from './Interviews';

const STAGES: { key: string; title: string; sub: string; statuses: string[]; closed?: boolean }[] = [
  { key: 'ready', title: 'CV ready', sub: 'approve on Today, then apply', statuses: ['awaiting-approval', 'approved'] },
  { key: 'applied', title: 'Applied', sub: 'sent, or a referral is in motion', statuses: ['applied', 'referral-pending', 'referred'] },
  { key: 'interviewing', title: 'Interviewing', sub: 'assessments, rounds and offers', statuses: ['interviewing', 'offer'] },
  { key: 'closed', title: 'Closed', sub: 'kept for the record', statuses: ['accepted', 'rejected', 'withdrawn'], closed: true },
];
const ALL = STAGES.flatMap((s) => s.statuses);

/** Everything you acted on, by where it stands. Backed up, exportable, never cleared by a resume update. */
export function Applications() {
  const toast = useToast();
  const { data } = useLive(() => api.matches({ status: ALL.join(',') }), [], (m) => Boolean(m.jobsChanged || m.queueChanged));
  const rows = data ?? [];
  async function exportAll() {
    try { const r = await api.exportApplications(); toast(`Exported ${r.count} applications to ${r.csv.split('/').slice(-2).join('/')}.`); } catch (e: any) { toast(e.message, true); }
  }
  async function backupNow() {
    try { const r = await api.backup(); toast(`Backed up to ${r.db.split('/').slice(-2).join('/')}.`); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <header className="head">
        <h1>Applications</h1>
        <span className="meta">{rows.filter((j) => !['awaiting-approval', 'approved'].includes(j.status)).length} applied · kept safe through resume updates</span>
        <span className="sp" />
        <button className="btn ghost" onClick={exportAll}>Export CSV</button>
        <button className="btn ghost" onClick={backupNow}>Back up now</button>
      </header>
      {STAGES.map((s) => {
        const list = rows.filter((j) => s.statuses.includes(j.status));
        return (
          <section key={s.key} className="lane">
            <div className="lane-head"><h2>{s.title}</h2><span className="count">{list.length}</span><span className="sub">{s.sub}</span></div>
            {list.length === 0 && <div className="empty-line">None.</div>}
            {list.map((j) => <Row key={j.id} j={j} closed={s.closed} />)}
          </section>
        );
      })}
      <section className="lane"><div className="lane-head"><h2>Interview prep</h2></div><Interviews embedded /></section>
    </>
  );
}

function Row({ j, closed }: { j: MatchRow; closed?: boolean }) {
  const fit = fitOf(j);
  return (
    <div className="jcard">
      <a className="jmain" href={`#/applications/job/${j.id}`}>
        <span className="jscore">{fit != null ? fit.toFixed(1) : '—'}</span>
        <span className="jtext">
          <span className="jt" style={closed ? { textDecoration: 'line-through' } : undefined}>{j.title}</span>
          <span className="jc">{j.company} · {placeOf(j) ?? 'location not stated'}{payOf(j) ? ` · ${payOf(j)}` : ''}</span>
        </span>
      </a>
      <span className="jside">
        <span className="tag ink">{j.status.replace(/-/g, ' ')}</span>
        <span className="mono muted">{ago(j.updated_at)}</span>
        {j.apply_url && <a className="btn ghost small" href={j.apply_url} target="_blank" rel="noreferrer">Posting</a>}
      </span>
    </div>
  );
}
