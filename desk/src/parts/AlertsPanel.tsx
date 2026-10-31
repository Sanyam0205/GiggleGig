import { useEffect, useState } from 'react';
import { api, type AlertsInfo } from '../api';
import { useToast } from '../App';

/** Phone alerts, fast lane and inbox watcher — the three things that make "apply within a day" happen. */
export function AlertsPanel() {
  const toast = useToast();
  const [a, setA] = useState<AlertsInfo | null>(null);
  const load = () => api.alerts().then(setA);
  useEffect(() => { load(); }, []);
  if (!a) return null;

  async function save(patch: object, msg: string) {
    try { await api.settings(patch); toast(msg); load(); } catch (e: any) { toast(e.message, true); }
  }

  return (
    <div className="alerts">
      <div className="alert-block">
        <label className="switch">
          <input type="checkbox" checked={a.enabled} onChange={(e) => save({ alerts: { enabled: e.target.checked } }, e.target.checked ? 'Phone alerts on.' : 'Phone alerts off.')} />
          <span aria-hidden="true" /><span className="sr-only">Phone alerts</span>
        </label>
        <div>
          <h3>Phone alerts</h3>
          <p className="muted">Install the free <b>ntfy</b> app, tap <b>+</b>, and subscribe to <span className="mono topic">{a.topic}</span> on ntfy.sh. New matches and ready resumes arrive with <b>Tailor</b> / <b>Approve</b> buttons; those buttons work while your phone is on the same Wi-Fi as this Mac.</p>
          <div className="row-actions">
            <label className="bar-at">Alert at
              <select className="field" value={a.minFit} onChange={(e) => save({ alerts: { minFit: Number(e.target.value) } }, `Alerting on ${e.target.value}+ fit.`)} aria-label="Minimum fit to alert">
                {[60, 65, 70, 75, 80, 85].map((v) => <option key={v} value={v}>{v}+ fit</option>)}
              </select>
            </label>
            <button className="btn ghost small" onClick={async () => { const r = await api.testAlert(); toast(r.ok ? 'Test alert sent — check your phone.' : 'Could not reach ntfy.sh.', !r.ok); }}>Send test alert</button>
          </div>
        </div>
      </div>
      <div className="alert-block">
        <label className="switch">
          <input type="checkbox" checked={a.fastlane.enabled} onChange={(e) => save({ fastlane: { enabled: e.target.checked } }, e.target.checked ? 'Fast lane on.' : 'Fast lane off.')} />
          <span aria-hidden="true" /><span className="sr-only">Fast lane</span>
        </label>
        <div>
          <h3>Fast lane</h3>
          <p className="muted">Every {a.fastlane.everyMinutes} minutes: tier-{a.fastlane.tier} company boards plus LinkedIn, Naukri, Indeed and Google for Jobs postings from the last {a.fastlane.hoursOld} hours. New roles are scored at once and alerted, so you can apply in the first day.</p>
          <div className="row-actions"><button className="btn ghost small" onClick={async () => { await api.start('fastlane'); toast('Fast lane running now.'); }}>Run now</button></div>
        </div>
      </div>
      <div className="alert-block">
        <label className="switch">
          <input type="checkbox" checked={a.inbox.enabled} onChange={(e) => save({ inbox: { enabled: e.target.checked } }, e.target.checked ? 'Inbox watcher on.' : 'Inbox watcher off.')} />
          <span aria-hidden="true" /><span className="sr-only">Inbox watcher</span>
        </label>
        <div>
          <h3>Inbox watcher</h3>
          <p className="muted">Every 30 minutes, reads hiring emails (online assessments, interview scheduling, recruiter replies, rejections, offers), moves the job on the pipeline, books interview prep and alerts you. Read-only: nothing is labelled or sent.</p>
          <div className="row-actions"><button className="btn ghost small" onClick={async () => { await api.start('inbox'); toast('Checking your inbox now.'); }}>Check now</button></div>
        </div>
      </div>
    </div>
  );
}
