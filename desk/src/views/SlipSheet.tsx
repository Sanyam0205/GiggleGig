import { useEffect, useState } from 'react';
import { api, ago, useStream } from '../api';
import { useToast } from '../App';
import { Icon } from '../parts/Icon';
import { ResumeFrame } from '../parts/ResumeFrame';
import { Kit } from '../parts/Kit';
import { Stamp } from '../parts/Stamp';
import { Track } from '../parts/Track';
import { consignment, KIND_LABEL, tracking } from '../parts/postal';

const LIMITS: Record<string, number> = { connection: 300, linkedin: 600 };

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** A slip opened: everything needed to approve with confidence — resume, reviewers, gaps, or the editable message. */
export function SlipSheet({ id, back }: { id: number; back: string }) {
  const toast = useToast();
  const [item, setItem] = useState<any>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [tab, setTab] = useState<'resume' | 'jd' | 'kit'>('resume');

  const load = () => api.queueItem(id).then((d) => { setItem(d); setDraft(d.body?.body ?? ''); }).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, [id]);
  useStream((m) => { if (m.queueChanged) load(); });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') window.location.hash = back; };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  if (!item) return null;
  const b = item.body ?? {};
  const isApp = item.kind === 'application';
  const files = item.job?.files ?? {};
  const review = files['review.json'] ? JSON.parse(files['review.json']) : null;
  const limit = item.kind === 'connection' ? null : b.channel === 'linkedin' ? LIMITS.linkedin : null;
  const edited = draft !== (b.body ?? '');

  async function act(action: 'approve' | 'reject' | 'done') {
    setBusy(action);
    try {
      await api.decide(id, action, edited ? { body: draft } : undefined);
      if (action === 'approve') { setFresh(true); toast(b.channel === 'email' ? 'Franked. Creating the Gmail draft…' : 'Franked.'); }
      if (action === 'reject') { toast('Rejected.'); window.location.hash = back; }
      if (action === 'done') toast(isApp ? 'Marked applied.' : 'Marked sent.');
      await load();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(null); }
  }

  async function save() {
    await api.editQueue(id, { body: draft });
    toast('Draft saved.');
    load();
  }

  async function copyOpen(text: string, url?: string) {
    const ok = await copy(text);
    if (url) window.open(url, '_blank', 'noopener');
    toast(ok ? 'Copied. Paste and send, then mark sent.' : 'Copy blocked by the browser — select the text and copy it manually.', !ok);
  }

  const franked = item.status === 'approved' || item.status === 'done';

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={item.title}>
      <button className="scrim" aria-label="Close" onClick={() => { window.location.hash = back; }} />
      <div className="sheet" style={{ position: 'relative' }}>
        <div className="top">
          <div>
            <div className="label muted">{KIND_LABEL[item.kind] ?? item.kind} · <span className="mono">{consignment(item)}</span></div>
            <h2>{isApp ? `${item.job_title} — ${item.company}` : item.title}</h2>
            <div className="muted" style={{ fontSize: 13 }}>Booked {ago(item.created_at)}{item.fit_score != null ? ` · fit ${item.fit_score}/100` : ''}{b.coverage != null ? ` · coverage ${b.coverage}` : ''}</div>
          </div>
          <span className="sp" />
          <a className="iconbtn" href={back} aria-label="Close"><Icon name="close" size={18} /></a>
        </div>
        <Track steps={tracking(item, item.job_status)} />
        {franked && <div style={{ position: 'relative', height: 0 }}><Stamp at={item.decided_at} fresh={fresh} /></div>}

        <div className="actions">
          {item.status === 'pending' && (
            <>
              <button className="btn frank" disabled={!!busy} onClick={() => act('approve')}>{busy === 'approve' ? <span className="spin" /> : null}Approve{edited ? ' with edits' : ''}</button>
              {edited && <button className="btn ghost" onClick={save}>Save draft</button>}
            </>
          )}
          {item.status === 'approved' && isApp && b.applyUrl && <a className="btn" href={b.applyUrl} target="_blank" rel="noreferrer"><Icon name="open" size={16} />Open apply page</a>}
          {item.status === 'approved' && isApp && b.pdf && <a className="btn ghost" href={`/files/${b.pdf.replace(/^output\//, '')}`} target="_blank" rel="noreferrer"><Icon name="doc" size={16} />resume.pdf</a>}
          {item.status === 'approved' && b.channel === 'linkedin' && <button className="btn" onClick={() => copyOpen(draft, b.profileUrl)}><Icon name="copy" size={16} />Copy &amp; open profile</button>}
          {item.status === 'approved' && b.channel !== 'email' && <button className="btn ghost" disabled={!!busy} onClick={() => act('done')}>{isApp ? 'Mark applied' : 'Mark sent'}</button>}
          {item.status === 'approved' && b.channel === 'email' && <span className="muted">Creating the Gmail draft — it moves to Dispatched when ready.</span>}
          {item.status === 'done' && <span className="tag violet">Dispatched {ago(item.decided_at)}</span>}
          <span className="sp" />
          {item.status === 'pending' && <button className="btn reject" disabled={!!busy} onClick={() => act('reject')}>Reject</button>}
        </div>

        {isApp && (
          <>
            {review && (
              <section>
                <h3>Reviewers</h3>
                <div className="review-grid">
                  {(review.reviews ?? []).map((r: any) => (
                    <div key={r.reviewer} className="review">
                      <div className="label muted">{r.reviewer}</div>
                      <div className="score">{r.score ?? '—'}<small className="muted">/10</small></div>
                      <span className={`tag ${r.verdict === 'pass' ? 'violet' : 'red'}`}>{r.verdict}</span>
                    </div>
                  ))}
                </div>
                {review.changesFromReview?.length > 0 && <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>Fixed after review: {review.changesFromReview.join('; ')}</p>}
              </section>
            )}
            {(review?.gaps ?? b.gaps ?? []).length > 0 && (
              <section>
                <h3>Gaps the resume does not claim</h3>
                <ul className="gaps">
                  {(review?.gaps ?? b.gaps).map((g: any, i: number) => <li key={i}><b>{g.requirement}</b> — {g.suggestion}</li>)}
                </ul>
              </section>
            )}
            <section>
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'resume'} onClick={() => setTab('resume')}>Tailored resume</button>
                <button role="tab" aria-selected={tab === 'jd'} onClick={() => setTab('jd')}>Job description</button>
                <button role="tab" aria-selected={tab === 'kit'} onClick={() => setTab('kit')}>Application kit{b.kit ? '' : ' ·  not ready'}</button>
              </div>
              {tab === 'resume' && <ResumeFrame html={item.job?.html} md={files['resume.md']} stamp={item.job?.updated_at} />}
              {tab === 'jd' && <div className="paper jd">{item.job?.description ?? 'No description captured.'}</div>}
              {tab === 'kit' && (b.kit || item.job?.kit ? <Kit kit={b.kit ?? item.job.kit} /> : (
                <div className="counter-empty">
                  <h3>No application kit yet.</h3>
                  <p>Drafts every form answer (notice period, CTC, why this company, custom questions) from your Q&amp;A file and experience.</p>
                  <button className="btn frank" onClick={async () => { await api.kit(item.job_id); toast('Preparing the application kit…'); }}>Prepare application kit</button>
                  <p className="muted small">Or run <span className="mono">/apply-assist {item.job_id}</span> in Claude Code to fill the form in Chrome; it stops before Submit.</p>
                </div>
              ))}
            </section>
            {review?.likelyQuestion && <section><h3>The hiring manager will likely ask</h3><p>{review.likelyQuestion}</p></section>}
          </>
        )}

        {item.kind === 'connection' && (
          <section>
            <h3>{b.items?.length ?? 0} people <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>copy each note, open the profile, send the request</span></h3>
            <div className="people">
              {(b.items ?? []).map((p: any, i: number) => (
                <div key={i} className="person">
                  <div><b>{p.name}</b> · {p.role} · {p.company}<div className="muted" style={{ fontSize: 12.5 }}>{p.why}</div></div>
                  <button className="btn small" onClick={() => copyOpen(p.note, p.profileUrl)}><Icon name="copy" size={15} />Copy &amp; open</button>
                  <div className="note">{p.note} <span className="mono muted">· {p.note?.length ?? 0}/300</span></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isApp && item.kind !== 'connection' && (
          <section>
            <h3>{b.channel === 'email' ? `Email to ${b.to ?? '—'}` : `LinkedIn message to ${b.to ?? item.contact?.name ?? '—'}`}</h3>
            {b.subject && <p style={{ marginBottom: 8 }}><span className="label muted">Subject</span> {b.subject}</p>}
            <textarea className="msg" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={item.status !== 'pending'} aria-label="Message" />
            {limit && <div className={`charcount${draft.length > limit ? ' over' : ''}`}>{draft.length}/{limit}</div>}
            {b.sequence?.next?.length > 0 && (
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                Marking this sent schedules {b.sequence.next.length} follow-up{b.sequence.next.length > 1 ? 's' : ''}: {b.sequence.next.map((s: any) => `day ${s.afterDays}`).join(', ')}.
              </div>
            )}
            {b.attachments?.length > 0 && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Attach: {b.attachments.join(', ')}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
