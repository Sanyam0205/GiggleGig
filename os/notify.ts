// Phone alerts over ntfy (https://ntfy.sh): no account, the app subscribes to a private random topic.
// Action buttons call the desk directly, so "Approve" works from the notification while the phone is on your Wi-Fi.
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { db, kvGet, kvSet } from './db.ts';
import { loadSearch } from './config.ts';

export function ntfyTopic() {
  let t = process.env.NTFY_TOPIC || kvGet('ntfy_topic');
  if (!t) { t = `jobsearch-${randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '')}`; kvSet('ntfy_topic', t); }
  return t;
}

/** The desk's LAN base URL with the access token, so buttons work from the phone. */
export function deskBase() {
  const ip = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address ?? 'localhost';
  return `http://${ip}:${process.env.DESK_PORT ?? 4321}`;
}

function deskToken() {
  return kvGet('desk_token') ?? '';
}

interface Action { label: string; url: string; method?: 'POST' | 'GET'; view?: boolean }

export async function push(title: string, message: string, opts: { actions?: Action[]; click?: string; priority?: 1 | 2 | 3 | 4 | 5; tags?: string[] } = {}) {
  const cfg = loadSearch();
  if (!cfg.alerts.enabled) return false;
  const actions = (opts.actions ?? []).map((a) => a.view
    ? { action: 'view', label: a.label, url: a.url, clear: true }
    : { action: 'http', label: a.label, url: a.url, method: a.method ?? 'POST', clear: true });
  try {
    const res = await fetch(cfg.alerts.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: ntfyTopic(), title, message, actions, click: opts.click, priority: opts.priority ?? 3, tags: opts.tags }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false; // alerts are best-effort; never fail a pipeline over them
  }
}

const link = (hash: string) => `${deskBase()}/?t=${deskToken()}#${hash}`;
const api = (path: string) => `${deskBase()}${path}?t=${deskToken()}`;

/** New strong matches since the last alert, one notification each (top 5), then a roll-up. */
export async function alertNewMatches() {
  const cfg = loadSearch();
  const rows = db.prepare(`SELECT id, company, title, location, fit_score, score5, summary, fit FROM jobs WHERE notified_at IS NULL AND fit_score >= ?
    AND status IN ('shortlisted','needs-referral') AND first_seen >= datetime('now', '-3 days') ORDER BY fit_score DESC`).all(cfg.alerts.minFit) as any[];
  if (!rows.length) return 0;
  const mark = db.prepare(`UPDATE jobs SET notified_at = datetime('now') WHERE id = ?`);
  for (const j of rows.slice(0, 5)) {
    const fit = j.fit ? JSON.parse(j.fit) : {};
    const report = j.summary ? JSON.parse(j.summary) : null;
    const pay = report?.advertised_comp ? ` · ${report.advertised_comp}` : '';
    const label = j.score5 != null ? `${Number(j.score5).toFixed(1)}/5` : `${j.fit_score} fit`;
    await push(`${label} · ${j.company}`, `${j.title}\n${j.location ?? ''}${pay}\n${report?.top_strengths?.[0] ?? fit.rationale ?? ''}`.trim(), {
      click: link(`/matches/job/${j.id}`),
      tags: ['briefcase'],
      priority: j.fit_score >= 85 ? 4 : 3,
      actions: [
        { label: 'Tailor resume', url: api(`/api/jobs/${j.id}/tailor`) },
        { label: 'Open', url: link(`/matches/job/${j.id}`), view: true },
      ],
    });
  }
  if (rows.length > 5) await push(`${rows.length - 5} more new matches`, 'Open Matches on the desk.', { click: link('/matches') });
  for (const j of rows) mark.run(j.id);
  return rows.length;
}

export async function alertSlip(queueId: number, title: string, detail: string) {
  return push(title, detail, {
    click: link(`/today/slip/${queueId}`),
    tags: ['envelope'],
    actions: [
      { label: 'Approve', url: api(`/api/queue/${queueId}/approve`) },
      { label: 'Review', url: link(`/today/slip/${queueId}`), view: true },
    ],
  });
}
