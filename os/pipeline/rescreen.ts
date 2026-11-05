// Review again with the full job description: named roles, or every role whose first review read only part of one.
import { db, setJobStatus } from '../db.ts';
import { startRun } from '../agent.ts';
import { triage } from '../engine/triage.ts';
import { FULL_JD } from './jd.ts';

export async function rescreen(ids: string[] = []) {
  const run = startRun('rescreen');
  // Only roles the quick review decided: never one you applied to, evaluated, or skipped yourself.
  const targets = ids.length ? ids : (db.prepare(`SELECT j.id FROM jobs j WHERE j.report_num IS NULL AND j.triage IS NOT NULL
      AND COALESCE(length(j.description), 0) < ${FULL_JD} AND COALESCE(j.jd_status, '') != 'full'
      AND (j.status = 'sourced' OR (j.status = 'skipped' AND (SELECT note FROM job_history h WHERE h.job_id = j.id ORDER BY h.id DESC LIMIT 1) LIKE 'triage %'))`)
    .all() as any[]).map((r) => r.id as string);
  if (!targets.length) { run.finish('nothing to review again'); return { rescreened: 0 }; }
  const reset = db.prepare(`UPDATE jobs SET triage = NULL, jd_status = NULL WHERE id = ? AND report_num IS NULL`);
  for (const id of targets) {
    reset.run(id);
    const status = (db.prepare('SELECT status FROM jobs WHERE id = ?').get(id) as any)?.status;
    if (status === 'skipped') setJobStatus(id, 'sourced', 'reviewing again with the full job description');
  }
  run.log(`Reviewing ${targets.length} role(s) again with full job descriptions`);
  run.finish(`${targets.length} queued`);
  let done = 0;
  for (let i = 0; i < targets.length; i += 80) done += (await triage(80, targets.slice(i, i + 80))).triaged ?? 0;
  return { rescreened: targets.length, reviewed: done };
}
