import { api, useLive } from '../api';

const TYPE_LABEL: Record<string, string> = {
  'dsa-coding': 'DSA / coding', 'system-design': 'System design', 'cs-fundamentals': 'CS fundamentals', 'project-deep-dive': 'Project deep dive',
  behavioral: 'Behavioral', debugging: 'Debugging', 'culture-motivation': 'Motivation', 'hr-logistics': 'HR',
};

export function Interviews({ embedded = false }: { embedded?: boolean }) {
  const { data } = useLive(api.interviews, [], () => false);
  return (
    <>
      {!embedded && (
        <header className="head">
          <h1>Interviews</h1>
          <span className="meta">Scheduled rounds, prep, and where your answers lose points.</span>
        </header>
      )}
      <div className="strip" style={{ marginTop: 0 }}>
        <div className="box">
          <h3>Rounds</h3>
          {data?.upcoming.length === 0 && <div className="empty-line">None yet. <span className="mono">/interview-prep &lt;job&gt;</span> adds a round with its prep doc.</div>}
          {data?.upcoming.map((i) => (
            <div key={i.id} className="li">
              <span><b>{i.company ?? '—'}</b> · {i.round}{i.prep_path ? <> · <a href={`/files/${i.prep_path.replace(/^output\//, '')}`} target="_blank" rel="noreferrer">prep</a></> : null}</span>
              <span className="mono">{i.scheduled_at ? new Date(i.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
          ))}
        </div>
        <div className="box">
          <h3>Weakest question types</h3>
          {data?.weakSpots.length === 0 && <div className="empty-line">Grades appear after your first <span className="mono">/mock-interview</span> or <span className="mono">/interview-debrief</span>.</div>}
          {data?.weakSpots.map((w) => (
            <div key={w.type} className="li">
              <span>{TYPE_LABEL[w.type] ?? w.type}</span>
              <span className="mono">{w.avg}/15 · {w.answers} answers</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
