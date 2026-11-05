// Your job history and profile are the one thing a code change must never cost: snapshots before risky steps,
// a restore, and a plain export of every application.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './db.ts';
import { DATA_DIR, DB_PATH, ROOT } from './paths.ts';

const DIR = join(DATA_DIR, 'backups');
const KEEP = 10;
const PROFILE = ['engine-data', 'context', 'config/search.json', 'output/resume'];

/** The database (a consistent copy, safe while the desk runs) and the profile files, newest 10 kept. */
export function backup(reason = 'manual') {
  mkdirSync(DIR, { recursive: true });
  const tag = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${reason.replace(/[^a-z0-9-]+/gi, '-')}`;
  const dbFile = join(DIR, `jobs-${tag}.db`);
  db.exec(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`);
  const parts = PROFILE.filter((p) => existsSync(join(ROOT, p)));
  const profile = parts.length ? join(DIR, `profile-${tag}.tgz`) : null;
  if (profile) execFileSync('tar', ['-czf', profile, ...parts], { cwd: ROOT });
  for (const prefix of ['jobs-', 'profile-']) {
    const all = readdirSync(DIR).filter((f) => f.startsWith(prefix)).sort();
    for (const f of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(DIR, f));
  }
  return { db: dbFile, profile };
}

export function listBackups() {
  return existsSync(DIR) ? readdirSync(DIR).filter((f) => /^(jobs|profile)-/.test(f)).sort().reverse() : [];
}

/** Put a backup back. The current state is backed up first, so a restore is itself undoable. Stop the desk before restoring the database. */
export function restoreBackup(name: string) {
  const file = existsSync(name) ? name : join(DIR, name);
  if (!existsSync(file)) throw new Error(`no backup ${name} (see: node os/cli.ts backup --list)`);
  const safety = backup('before-restore');
  if (file.endsWith('.tgz')) {
    execFileSync('tar', ['-xzf', file], { cwd: ROOT });
    return { restored: file, kind: 'profile', safety };
  }
  db.close();
  for (const suffix of ['-wal', '-shm']) rmSync(DB_PATH + suffix, { force: true });
  copyFileSync(file, DB_PATH);
  return { restored: file, kind: 'database', safety, note: 'restart the desk (npm run desk) so it reads the restored database' };
}

const APPLIED = ['applied', 'referral-pending', 'referred', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn'];

/** Every role you applied to, as CSV and Markdown under data/exports/. */
export function exportApplications() {
  const rows = db.prepare(`SELECT j.id, j.company, j.title, j.status, COALESCE(j.apply_url, j.url) link, j.location, j.score5, j.decision,
      (SELECT MIN(ts) FROM job_history h WHERE h.job_id = j.id AND h.status = 'applied') applied_at,
      (SELECT group_concat(note, ' | ') FROM job_history h WHERE h.job_id = j.id AND h.note IS NOT NULL) notes
    FROM jobs j WHERE j.status IN (${APPLIED.map(() => '?').join(',')}) ORDER BY applied_at DESC, j.updated_at DESC`).all(...APPLIED) as any[];
  const dir = join(DATA_DIR, 'exports');
  mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const cols = ['applied_at', 'company', 'title', 'status', 'location', 'score5', 'decision', 'link', 'notes', 'id'];
  const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  writeFileSync(join(dir, `applications-${day}.csv`), [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
  const md = (v: unknown) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
  writeFileSync(join(dir, `applications-${day}.md`), `# Applications (${rows.length}), exported ${day}\n\n| Applied | Company | Role | Status | Link |\n|---|---|---|---|---|\n` +
    rows.map((r) => `| ${md(r.applied_at?.slice(0, 10))} | ${md(r.company)} | ${md(r.title)} | ${md(r.status)} | ${md(r.link)} |`).join('\n') + '\n');
  return { count: rows.length, csv: join(dir, `applications-${day}.csv`), md: join(dir, `applications-${day}.md`) };
}
