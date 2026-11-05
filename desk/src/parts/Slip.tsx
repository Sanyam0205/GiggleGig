import { useState } from 'react';
import { api, type QueueItem } from '../api';
import { useToast } from '../App';
import { Stamp } from './Stamp';
import { Track } from './Track';
import { consignment, KIND_LABEL, tracking } from './postal';

function preview(q: QueueItem) {
  const b = q.body ?? {};
  if (q.kind === 'connection') return `${b.items?.length ?? 0} notes · ${[...new Set((b.items ?? []).map((i: any) => i.company))].slice(0, 4).join(', ')}`;
  return b.body ? String(b.body).slice(0, 180) : '';
}

/** One booking slip. Approve franks it (the stamp lands); the follow-through action then dispatches it. */
export function Slip({ q, base }: { q: QueueItem; base: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [freshStamp, setFreshStamp] = useState(false);
  const open = () => { window.location.hash = `${base}/slip/${q.id}`; };
  const isApp = q.kind === 'application';
  const isLinkedIn = q.body?.channel === 'linkedin' || q.kind === 'connection';
  const franked = q.status === 'approved';

  async function act(action: 'approve' | 'reject' | 'done') {
    setBusy(action);
    try {
      await api.decide(q.id, action);
      if (action === 'approve') {
        setFreshStamp(true);
        if (isApp && q.body?.applyUrl) toast('Approved. Open the apply page when you are ready.');
        else if (q.body?.channel === 'email') toast('Approved. Creating the Gmail draft…');
        else toast('Approved.');
      }
      if (action === 'reject') toast('Rejected. It will not be sent.');
      if (action === 'done') toast(isApp ? 'Marked applied.' : 'Marked sent.');
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function copyAndOpen() {
    const text = q.body?.body ?? '';
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked on http LAN; sheet has a manual copy */ }
    if (q.body?.profileUrl) window.open(q.body.profileUrl, '_blank', 'noopener');
    toast('Message copied. Paste it, send it, then mark sent.');
  }

  return (
    <div className="slip">
      <div className="stub">
        <span className="label">{KIND_LABEL[q.kind] ?? q.kind}</span>
        <span className="mono">{consignment(q)}</span>
        {q.fit_score != null ? <span className="fit">{(q.fit_score / 20).toFixed(1)}<small>of 5</small></span> : <span className="fit none">—</span>}
      </div>
      <div className="body">
        <button className="t" onClick={open}>{isApp ? q.job_title ?? q.title : q.title}</button>
        {isApp
          ? <div className="co">{q.company} · {q.body?.pdf ? 'resume.pdf ready' : 'resume.md ready'}</div>
          : <div className="preview">{preview(q)}</div>}
        {isApp && (
          <div className="facts">
            <span>Coverage <b>{q.body?.coverage ?? '—'}</b></span>
            <span>Reviewers <b>{(q.body?.reviews ?? []).filter((r: any) => r.verdict === 'pass').length}/{(q.body?.reviews ?? []).length || 3} pass</b></span>
            {q.body?.gaps?.[0] && <span>Gap <b>{q.body.gaps[0].requirement}</b></span>}
          </div>
        )}
        <Track steps={tracking(q)} />
      </div>
      {(franked || q.status === 'done') && <Stamp at={q.decided_at} fresh={freshStamp} label="APPROVED" />}
      <div className="act">
        {q.status === 'pending' ? (
          <>
            <div className="row">
              <button className="btn ghost small" onClick={open}>{isApp ? 'Review' : 'Edit'}</button>
              <button className="btn frank" disabled={!!busy} onClick={() => act('approve')}>
                {busy === 'approve' ? <span className="spin" /> : null}Approve
              </button>
            </div>
            <button className="btn reject small" disabled={!!busy} onClick={() => act('reject')}>Reject</button>
          </>
        ) : (
          <>
            <span className="tag violet">Approved</span>
            <div className="row">
              {isApp && q.body?.applyUrl && <a className="btn" href={q.body.applyUrl} target="_blank" rel="noreferrer">Open apply page</a>}
              {isLinkedIn && q.kind !== 'connection' && <button className="btn" onClick={copyAndOpen}>Copy &amp; open profile</button>}
              {q.kind === 'connection' && <button className="btn" onClick={open}>Work the batch</button>}
            </div>
            {q.body?.channel !== 'email' && (
              <button className="btn ghost small" disabled={!!busy} onClick={() => act('done')}>{isApp ? 'Mark applied' : 'Mark sent'}</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
