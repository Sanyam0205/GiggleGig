// Tracker ↔ desk. career-ops owns statuses (data/applications.md, written only through its scripts);
// the desk's job rows mirror them, and desk status changes are written back through set-status.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, kvGet, kvSet, statusHooks } from '../db.ts';
import { ENGINE_DATA, ENGINE_FILES } from './paths.ts';
import { engineScript } from './run.ts';
import { applyReport, bucketFor, parseReport, reportPath } from './reports.ts';

export const CANONICAL = ['Evaluated', 'Applied', 'Responded', 'Assessment', 'Interview', 'Offer', 'Hired', 'Rejected', 'Discarded', 'SKIP'] as const;

/** Desk stage → canonical tracker state (stages with no tracker meaning map to null and are not written). */
const TO_ENGINE: Record<string, string | null> = {
  shortlisted: 'Evaluated', 'needs-referral': 'Evaluated', 'awaiting-approval': 'Evaluated', approved: 'Evaluated',
  applied: 'Applied', 'referral-pending': null, referred: null, interviewing: 'Interview', offer: 'Offer',
  accepted: 'Hired', rejected: 'Rejected', withdrawn: 'Discarded', skipped: 'SKIP',
};

/** Canonical tracker state → desk stage (Evaluated keeps whatever the decision bucket says). */
const FROM_ENGINE: Record<string, string | null> = {
  Evaluated: null, Applied: 'applied', Responded: 'applied', Assessment: 'interviewing', Interview: 'interviewing',
  Offer: 'offer', Hired: 'accepted', Rejected: 'rejected', Discarded: 'withdrawn', SKIP: 'skipped',
};

interface TrackerRow { num: string; company: string; role: string; score: string; status: string; report: string | null; url: string | null }

export function readTracker(): TrackerRow[] {
  if (!existsSync(ENGINE_FILES.tracker)) return [];
  const lines = readFileSync(ENGINE_FILES.tracker, 'utf8').split('\n').filter((l) => l.startsWith('|'));
  if (lines.length < 2) return [];
  const head = lines[0].split('|').map((c) => c.trim().toLowerCase());
  const at = (name: string) => head.indexOf(name);
  return lines.slice(2).map((l) => {
    const c = l.split('|').map((x) => x.trim());
    const report = /\[(\d+)\]/.exec(c[at('report')] ?? '')?.[1] ?? null;
    const urlCell = at('url') >= 0 ? c[at('url')] : '';
    const url = /\((https?:[^)]+)\)/.exec(urlCell)?.[1] ?? (/^https?:/.test(urlCell) ? urlCell : null);
    return { num: c[at('#')], company: c[at('company')], role: c[at('role')], score: c[at('score')], status: c[at('status')], report, url };
  }).filter((r) => r.num);
}

/** Pull tracker state into the desk: new reports, status moves made in Claude Code or by engine modes. */
export function syncFromTracker() {
  let updated = 0;
  for (const row of readTracker()) {
    if (!row.report) continue;
    const inFlight = db.prepare('SELECT 1 FROM jobs WHERE pending_report = ? OR pending_report = ?').get(row.report, row.report.padStart(3, '0'));
    if (inFlight) continue;
    let job = db.prepare('SELECT id, status, engine_status, report_num FROM jobs WHERE report_num = ? OR report_num = ?')
      .get(row.report, row.report.padStart(3, '0')) as any;
    const path = reportPath(row.report);
    if (!job && path) {
      // A report made outside the desk (e.g. /career-ops in Claude Code): adopt it as a job row.
      const parsed = parseReport(path);
      const url = parsed.header.url ?? row.url ?? null;
      const id = `co${row.report.padStart(4, '0')}`.padEnd(12, '0').slice(0, 12);
      db.prepare(`INSERT OR IGNORE INTO jobs (id, dedupe_key, source, sources, company, title, url, apply_url, status)
        VALUES (?, ?, 'manual', '["manual"]', ?, ?, ?, ?, 'sourced')`).run(id, `report|${row.report}`, row.company, row.role, url, url);
      applyReport(id, parsed);
      db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(bucketFor(parsed.summary?.final_decision, parsed.summary?.score), id);
      job = db.prepare('SELECT id, status, engine_status FROM jobs WHERE id = ?').get(id);
    }
    if (!job) continue;
    if (job.engine_status !== row.status) {
      const stage = FROM_ENGINE[row.status];
      db.prepare(`UPDATE jobs SET engine_status = ?, status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?`)
        .run(row.status, stage && stage !== job.status ? stage : null, job.id);
      updated++;
    }
  }
  return { updated };
}

// Desk → tracker. Registered on import: every setJobStatus for a job with a report also moves the tracker row.
/** An applied role with no evaluation report still gets a tracker row: a plain-text second copy of what you applied to. */
export async function trackApplied(jobId: string) {
  if (kvGet(`tracked:${jobId}`)) return false;
  const j = db.prepare('SELECT company, title, apply_url, url, report_num FROM jobs WHERE id = ?').get(jobId) as any;
  if (!j || j.report_num) return false;
  const r = await engineScript('reserve-report-num.mjs');
  const num = /(\d{3,})/.exec(r.stdout)?.[1];
  if (!num) return false;
  const cell = (s: unknown) => String(s ?? '').replace(/[\t\r\n|]+/g, ' ').trim();
  mkdirSync(ENGINE_FILES.additions, { recursive: true });
  writeFileSync(join(ENGINE_FILES.additions, `os-applied-${jobId}.tsv`), [num, new Date().toISOString().slice(0, 10), cell(j.company), cell(j.title),
    'Applied', 'N/A', '❌', '-', 'Applied from GiggleGig (no evaluation report)', cell(j.apply_url ?? j.url)].join('\t') + '\n');
  const merged = await engineScript('merge-tracker.mjs');
  await engineScript('reserve-report-num.mjs', ['--release', num]);
  if (merged.code === 0) kvSet(`tracked:${jobId}`, num);
  return merged.code === 0;
}

export async function trackAllApplied() {
  const ids = (db.prepare(`SELECT id FROM jobs WHERE report_num IS NULL AND status IN ('applied','referral-pending','referred','interviewing','offer','accepted')`).all() as any[]).map((r) => r.id);
  let added = 0;
  for (const id of ids) if (await trackApplied(id)) added++;
  return { applied: ids.length, added };
}

statusHooks.push((jobId, status, note) => {
  if (status === 'applied') void trackApplied(jobId);
  const target = TO_ENGINE[status];
  if (!target) return;
  const job = db.prepare('SELECT report_num, engine_status FROM jobs WHERE id = ?').get(jobId) as any;
  if (!job?.report_num || job.engine_status === target) return;
  db.prepare('UPDATE jobs SET engine_status = ? WHERE id = ?').run(target, jobId);
  void engineScript('set-status.mjs', ['--report', String(job.report_num), target, ...(note ? ['--note', note.slice(0, 200)] : [])]);
});

/** The engine's own integrity pass (tracker dedupe, canonical statuses, 17 checks). */
export async function housekeeping() {
  const out: Record<string, number> = {};
  for (const [name, args] of [['normalize-statuses.mjs', []], ['dedup-tracker.mjs', []], ['verify-pipeline.mjs', []]] as const) {
    out[name] = (await engineScript(name, [...args], { timeoutMs: 120_000 })).code;
  }
  return out;
}

export const ENGINE_DATA_DIR = ENGINE_DATA;
export const reportFile = (num: string) => reportPath(num) ?? join(ENGINE_FILES.reports, `${num}.md`);
