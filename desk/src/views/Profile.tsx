import { useState } from 'react';
import { api, useLive } from '../api';
import { useToast } from '../App';
import { Sources } from './Sources';
import { Contacts } from './Contacts';
import { UsagePanel } from '../parts/Usage';
import { EnginePanel } from '../parts/EnginePanel';

const TABS = [
  { key: 'you', label: 'Resume & preferences' }, { key: 'sources', label: 'Sources & alerts' },
  { key: 'contacts', label: 'Contacts' }, { key: 'usage', label: 'Usage & data' },
];

/** You: the resume everything is built from, your rules, where the search looks, and what it costs. */
export function Profile({ tab = 'you' }: { tab?: string }) {
  return (
    <>
      <header className="head"><h1>Profile</h1><span className="meta">Your resume, your rules, your sources and your usage</span></header>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => { window.location.hash = `#/profile/${t.key}`; }}>{t.label}</button>)}
      </div>
      {tab === 'you' && <You />}
      {tab === 'sources' && <Sources embedded />}
      {tab === 'contacts' && <Contacts embedded />}
      {tab === 'usage' && <UsageAndData />}
    </>
  );
}

function You() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data: cfg } = useLive(api.config, [], () => false);
  const { data: candidate } = useLive(() => api.candidate(), [], (m) => Boolean(m.runs));
  const s = cfg?.search;
  const p = s?.preferences ?? {};
  async function upload(e: React.ChangeEvent<HTMLInputElement>, mode: 'update' | 'new-candidate') {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const confirm = mode === 'new-candidate' ? window.prompt('This wipes every job, status and note (a backup is taken first). Type NEW CANDIDATE to continue.') ?? '' : undefined;
    if (mode === 'new-candidate' && confirm !== 'NEW CANDIDATE') return;
    setBusy(true);
    try {
      await api.uploadResume(file, mode, confirm);
      toast(mode === 'update' ? 'Rebuilding your profile from this resume. Jobs and applications are kept.' : 'Starting a new candidate from this resume.');
    } catch (err: any) { toast(err.message, true); } finally { setBusy(false); }
  }
  return (
    <div className="profile-grid">
      <section className="source">
        <div className="source-head">
          <div><h3>Your resume</h3><p className="muted">Every tailored CV is built from it and fact-checked against it. Upload an updated version as PDF, DOCX, TXT or Markdown; your jobs and applications stay.</p></div>
        </div>
        <div className="row-actions">
          <label className={`btn frank${busy ? ' disabled' : ''}`}>{busy ? <span className="spin" /> : null}Update resume<input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={(e) => upload(e, 'update')} hidden /></label>
        </div>
        {candidate?.state === 'intake' && <p className="notice small" style={{ marginTop: 10 }}>Rebuilding the profile. Searching is paused until it is ready.</p>}
        {candidate?.state === 'failed' && <p className="notice small" style={{ marginTop: 10 }}>The last upload failed: {candidate.error}</p>}
        {candidate?.state === 'none' && <p className="notice small" style={{ marginTop: 10 }}>No profile yet. Upload a resume to start.</p>}
        <p className="small muted" style={{ marginTop: 12 }}>
          Someone else's resume? <label className="link">Start a new candidate<input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={(e) => upload(e, 'new-candidate')} hidden /></label> wipes every job, status and note after a backup.
        </p>
      </section>
      <section className="source">
        <div className="source-head"><div><h3>Your rules</h3><p className="muted">Every review applies these. They live in config/search.json and survive a resume update.</p></div></div>
        {s && (
          <dl className="prefs">
            <dt>Where</dt><dd>{s.remote?.only ? 'Remote only' : 'Remote preferred; offices in India are fine'} · {(s.locations ?? []).slice(0, 6).join(', ')}{(s.locations ?? []).length > 6 ? '…' : ''}</dd>
            <dt>Pay floor</dt><dd>{p.minAnnualSalary ? `₹${(p.minAnnualSalary / 100000).toFixed(1)} LPA a year; posted pay below it is dropped` : 'None set'}</dd>
            <dt>Experience asked</dt><dd>{p.experience ? `${p.experience} years fits best` : 'Not set'}</dd>
            <dt>Never</dt><dd>{(p.exclude ?? []).join(', ') || 'Nothing excluded'}</dd>
            <dt>Searching for</dt><dd>{(s.queries ?? []).join(', ')}</dd>
            {(p.notes ?? []).length > 0 && <><dt>Notes</dt><dd>{p.notes.join(' ')}</dd></>}
          </dl>
        )}
      </section>
    </div>
  );
}

function UsageAndData() {
  const toast = useToast();
  const { data: limits } = useLive(() => api.limits(), [], (m) => Boolean(m.runs));
  async function act(fn: () => Promise<any>, label: (r: any) => string) {
    try { toast(label(await fn())); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      {limits && <UsagePanel l={limits} />}
      <section className="source">
        <div className="source-head">
          <div><h3>Your data</h3><p className="muted">The job database and your profile are backed up before every risky step (resume updates, merges, restores). Ten copies are kept in data/backups/. Restore one with <span className="mono">node os/cli.ts restore-backup &lt;file&gt;</span>.</p></div>
          <span className="sp" />
          <button className="btn ghost" onClick={() => act(api.backup, (r) => `Backed up to ${r.db.split('/').slice(-2).join('/')}.`)}>Back up now</button>
          <button className="btn ghost" onClick={() => act(api.exportApplications, (r) => `Exported ${r.count} applications.`)}>Export applications</button>
        </div>
      </section>
      <EnginePanel />
    </>
  );
}
