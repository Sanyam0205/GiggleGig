// One-off clean-up: postings that arrived twice (another company spelling, a tracking link) become one job.
// The copy you acted on wins: an applied job is never merged away into a fresh one.
import { db } from '../db.ts';
import { backup } from '../backup.ts';
import { dedupeKey, urlKey } from './ingest.ts';

const PROGRESS = ['accepted', 'offer', 'interviewing', 'referred', 'referral-pending', 'applied', 'rejected', 'withdrawn', 'approved',
  'awaiting-approval', 'tailoring', 'shortlisted', 'needs-referral', 'evaluating', 'sourced', 'skipped', 'filtered'];
const REPORT = ['report_num', 'report_path', 'score5', 'decision', 'confidence', 'legitimacy', 'archetype', 'summary', 'engine_status'];

export function dedupe() {
  const saved = backup('before-dedupe');
  const jobs = db.prepare(`SELECT id, company, title, url, apply_url, status, sources, description, report_num, first_seen FROM jobs`).all() as any[];

  // Union-find over every key a job has: its link keys and its company|title key.
  const parent = new Map<string, string>(jobs.map((j) => [j.id, j.id]));
  const root = (id: string): string => (parent.get(id) === id ? id : (parent.set(id, root(parent.get(id)!)), parent.get(id)!));
  const owner = new Map<string, string>();
  for (const j of jobs) {
    for (const k of [urlKey(j.apply_url), urlKey(j.url), `dk:${dedupeKey(j)}`].filter(Boolean) as string[]) {
      const other = owner.get(k);
      if (other) parent.set(root(j.id), root(other));
      else owner.set(k, j.id);
    }
  }
  const groups = new Map<string, any[]>();
  for (const j of jobs) groups.set(root(j.id), [...(groups.get(root(j.id)) ?? []), j]);

  const rankOf = (j: any) => (j.report_num ? -1 : 0) + PROGRESS.indexOf(j.status) * 2;
  const moved = ['job_history', 'queue', 'runs', 'interviews', 'inbox_seen'];
  let merged = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => rankOf(a) - rankOf(b) || String(a.first_seen).localeCompare(String(b.first_seen)));
      const [keep, ...dupes] = group;
      const sources = new Set<string>(group.flatMap((j) => JSON.parse(j.sources)));
      const description = group.map((j) => j.description ?? '').sort((a, b) => b.length - a.length)[0] || null;
      const withReport = keep.report_num ? null : dupes.find((d) => d.report_num);
      db.prepare('UPDATE jobs SET sources = ?, description = ?, apply_url = COALESCE(apply_url, ?), url = COALESCE(url, ?) WHERE id = ?')
        .run(JSON.stringify([...sources]), description, dupes.find((d) => d.apply_url)?.apply_url ?? null, dupes.find((d) => d.url)?.url ?? null, keep.id);
      if (withReport) {
        const r = db.prepare(`SELECT ${REPORT.join(', ')} FROM jobs WHERE id = ?`).get(withReport.id) as any;
        db.prepare(`UPDATE jobs SET ${REPORT.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...REPORT.map((c) => r[c]), keep.id);
      }
      for (const d of dupes) {
        for (const table of moved) db.prepare(`UPDATE ${table} SET job_id = ? WHERE job_id = ?`).run(keep.id, d.id);
        db.prepare('DELETE FROM jobs WHERE id = ?').run(d.id);
        merged++;
      }
    }
    // Every surviving job gets today's keys, so later scouts match it the same way.
    const setKeys = db.prepare('UPDATE jobs SET url_key = ?, dedupe_key = ? WHERE id = ?');
    for (const j of db.prepare('SELECT id, company, title, url, apply_url FROM jobs').all() as any[]) {
      setKeys.run(urlKey(j.apply_url) ?? urlKey(j.url), dedupeKey(j), j.id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { merged, backup: saved.db };
}
