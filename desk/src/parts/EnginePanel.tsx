import { useEffect, useState } from 'react';
import { api, ago } from '../api';
import { useToast } from '../App';

/** Career workflow health and integrity controls. */
export function EnginePanel() {
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verify, setVerify] = useState<string | null>(null);
  const load = () => api.engine().then(setD).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, []);

  async function run(a: 'update-check' | 'update' | 'verify') {
    setBusy(a);
    try {
      const r = await api.engineAction(a);
      if (a === 'verify') setVerify(typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2));
      else toast(a === 'update' ? (r.code === 0 ? 'Workflow tools updated.' : 'Update did not apply: see the run log.') : 'Checked for workflow updates.', r.code !== 0);
      load();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(null); }
  }

  const doc = d?.doctor;
  const upd = d?.update;
  const available = upd?.status === 'update-available';
  return (
    <section className="source">
      <div className="source-head">
        <div>
          <h3>Career workflows {d?.version ? `v${d.version}` : ''}</h3>
          <p className="muted">
            Candidate matching, resume tailoring, application tracking, and company discovery run through your AI agents.{' '}
            {doc ? (doc.onboardingNeeded ? `Setup incomplete: missing ${doc.missing.join(', ')}.` : `Doctor: ready${doc.warnings?.length ? ` · ${doc.warnings.length} warning(s)` : ''}.`) : 'Checking…'}
            {upd ? ` · ${available ? `Update available: v${upd.local} → v${upd.remote}` : 'Up to date'} (checked ${ago(upd.checkedAt?.replace('T', ' ').slice(0, 19))})` : ''}
          </p>
          {doc?.unpersonalized?.length > 0 && <p className="err">Still template: {doc.unpersonalized.map((u: any) => u.path).join(', ')}</p>}
          {doc?.warnings?.map((w: string, i: number) => <p key={i} className="muted small">{w.split('\n')[0]}</p>)}
        </div>
        <span className="sp" />
        <div className="row-actions">
          <button className="btn ghost small" disabled={!!busy} onClick={() => run('verify')}>{busy === 'verify' ? <span className="spin" /> : null}Check integrity</button>
          <button className="btn ghost small" disabled={!!busy} onClick={() => run('update-check')}>{busy === 'update-check' ? <span className="spin" /> : null}Check for update</button>
          {available && <button className="btn frank small" disabled={!!busy} onClick={() => run('update')}>{busy === 'update' ? <span className="spin" /> : null}Update to v{upd.remote}</button>}
        </div>
      </div>
      {available && upd.changelog && <details className="how"><summary>What's new in v{upd.remote}</summary><div className="paper jd">{String(upd.changelog).slice(0, 4000)}</div></details>}
      {verify && <div className="events" style={{ marginTop: 8 }}><pre className="mono small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{verify}</pre></div>}
    </section>
  );
}
