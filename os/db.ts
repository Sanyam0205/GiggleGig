import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, DB_PATH, ROOT } from './paths.ts';

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,           -- stable hash of dedupe_key
  dedupe_key    TEXT NOT NULL UNIQUE,       -- normalized company|title|location
  source        TEXT NOT NULL,              -- greenhouse, lever, jobspy:linkedin, gmail:wellfound, ...
  sources       TEXT NOT NULL DEFAULT '[]', -- every source that surfaced this posting
  company       TEXT NOT NULL,
  title         TEXT NOT NULL,
  location      TEXT,
  remote        INTEGER NOT NULL DEFAULT 0,
  url           TEXT,
  apply_url     TEXT,
  description   TEXT,
  salary_min    INTEGER,
  salary_max    INTEGER,
  currency      TEXT,
  posted_at     TEXT,
  first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
  status        TEXT NOT NULL DEFAULT 'sourced',
  filter_reason TEXT,
  fit_score     INTEGER,
  fit           TEXT,                       -- JSON from the scorer
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_company ON jobs(company);

CREATE TABLE IF NOT EXISTS job_history (
  id      INTEGER PRIMARY KEY,
  job_id  TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status  TEXT NOT NULL,
  note    TEXT,
  ts      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY,
  agent       TEXT NOT NULL,                -- scout:gmail, scorer, resume-tailor, ...
  job_id      TEXT,
  status      TEXT NOT NULL DEFAULT 'running', -- running | done | failed | stopped
  model       TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT,
  duration_ms INTEGER,
  turns       INTEGER,
  cost_usd    REAL,
  summary     TEXT,
  error       TEXT,
  session_id  TEXT
);
CREATE INDEX IF NOT EXISTS runs_started ON runs(started_at);

CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY,
  run_id  INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  ts      TEXT NOT NULL DEFAULT (datetime('now')),
  type    TEXT NOT NULL,                    -- tool | text | log | error
  text    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_run ON events(run_id);

CREATE TABLE IF NOT EXISTS queue (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,                -- application | referral | connection | email | followup | thank-you
  job_id      TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  contact_id  INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,                -- JSON payload the desk renders
  status      TEXT NOT NULL DEFAULT 'pending', -- scheduled | pending | approved | rejected | done
  due_at      TEXT,                         -- scheduled follow-ups become pending at this time
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at  TEXT
);
CREATE INDEX IF NOT EXISTS queue_status ON queue(status);

CREATE TABLE IF NOT EXISTS contacts (
  id              INTEGER PRIMARY KEY,
  company         TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT,
  linkedin        TEXT,
  email           TEXT,
  relationship    TEXT NOT NULL DEFAULT 'cold', -- cold | requested | connected | warm | referrer
  last_contact_at TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interviews (
  id            INTEGER PRIMARY KEY,
  job_id        TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  round         TEXT,
  scheduled_at  TEXT,
  calendar_id   TEXT UNIQUE,
  prep_path     TEXT,
  debrief_path  TEXT,
  scores        TEXT,                         -- JSON per question type
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Columns added after the first schema; ALTER fails harmlessly when they already exist.
for (const sql of ['ALTER TABLE queue ADD COLUMN due_at TEXT', 'ALTER TABLE runs ADD COLUMN pid INTEGER', 'ALTER TABLE runs ADD COLUMN owner_pid INTEGER',
  'ALTER TABLE jobs ADD COLUMN notified_at TEXT',
  `CREATE TABLE IF NOT EXISTS inbox_seen (thread_id TEXT PRIMARY KEY, kind TEXT, company TEXT, job_id TEXT, summary TEXT, ts TEXT NOT NULL DEFAULT (datetime('now')))`,
  'CREATE INDEX IF NOT EXISTS contacts_company ON contacts(company)',
  // career-ops engine fields: the report, its 1–5 score and Machine Summary, triage, and the tracker status.
  'ALTER TABLE jobs ADD COLUMN report_num TEXT',
  'ALTER TABLE jobs ADD COLUMN report_path TEXT',
  'ALTER TABLE jobs ADD COLUMN score5 REAL',
  'ALTER TABLE jobs ADD COLUMN decision TEXT',
  'ALTER TABLE jobs ADD COLUMN confidence TEXT',
  'ALTER TABLE jobs ADD COLUMN legitimacy TEXT',
  'ALTER TABLE jobs ADD COLUMN archetype TEXT',
  'ALTER TABLE jobs ADD COLUMN summary TEXT',
  'ALTER TABLE jobs ADD COLUMN triage TEXT',
  'ALTER TABLE jobs ADD COLUMN engine_status TEXT',
  'CREATE INDEX IF NOT EXISTS jobs_report ON jobs(report_num)',
  'ALTER TABLE runs ADD COLUMN provider TEXT',
  // The report number an evaluation has reserved but not finished, so a tracker sync never mistakes it for an outside report.
  'ALTER TABLE jobs ADD COLUMN pending_report TEXT',
  // One key per posting from its link (a board's job id where there is one), so the same posting never shows twice.
  'ALTER TABLE jobs ADD COLUMN url_key TEXT',
  'CREATE INDEX IF NOT EXISTS jobs_url_key ON jobs(url_key)',
  // Whether the full job description was found before review: full | partial | missing, and where it came from.
  'ALTER TABLE jobs ADD COLUMN jd_status TEXT',
  'ALTER TABLE jobs ADD COLUMN jd_source TEXT']) {
  try { db.exec(sql); } catch { /* already migrated */ }
}

/** Listeners for status moves (the career-ops bridge mirrors them into its tracker). */
export const statusHooks: ((jobId: string, status: string, note?: string) => void)[] = [];

export function setJobStatus(jobId: string, status: string, note?: string) {
  db.prepare(`UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, jobId);
  db.prepare(`INSERT INTO job_history (job_id, status, note) VALUES (?, ?, ?)`).run(jobId, status, note ?? null);
  for (const hook of statusHooks) { try { hook(jobId, status, note); } catch { /* a mirror must never break the desk */ } }
}

export function kvGet(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function kvSet(key: string, value: string) {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

const pidAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/**
 * Scheduled pipelines overlap (briefing, fast lane, scout, watch, desk buttons all run as separate processes).
 * Spend-heavy steps run one at a time across processes; a second caller skips instead of redoing the same work.
 */
export async function withLock<T>(name: string, busy: T, fn: () => Promise<T>): Promise<T> {
  const key = `lock:${name}`;
  db.exec('BEGIN IMMEDIATE');
  const holder = Number(kvGet(key) ?? 0);
  if (holder && holder !== process.pid && pidAlive(holder)) { db.exec('COMMIT'); return busy; }
  kvSet(key, String(process.pid));
  db.exec('COMMIT');
  try { return await fn(); } finally { db.prepare('DELETE FROM kv WHERE key = ? AND value = ?').run(key, String(process.pid)); }
}

export type CandidateState = { state: 'none' | 'intake' | 'failed' | 'ready'; at: string; error?: string };

/** No recorded state: a workspace from before intake tracking is ready if it has a CV; a fresh install has none. */
export function candidateState(): CandidateState {
  const raw = kvGet('candidate');
  if (raw) return JSON.parse(raw);
  return existsSync(join(ROOT, 'engine-data/cv.md')) ? { state: 'ready', at: '' } : { state: 'none', at: '' };
}

export function setCandidateState(state: CandidateState['state'], error?: string) {
  kvSet('candidate', JSON.stringify({ state, at: new Date().toISOString(), error }));
}
