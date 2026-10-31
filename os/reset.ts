import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './db.ts';
import { ENGINE_DATA } from './engine/paths.ts';
import { CONTEXT_DIR, DATA_DIR, JOBS_OUT, OUTPUT_DIR } from './paths.ts';

// Every file the setup skill rebuilds. Kept out of the agent's way, not deleted, so a mistaken upload is recoverable.
const CANDIDATE_FILES = [
  join(ENGINE_DATA, 'cv.md'), join(ENGINE_DATA, 'article-digest.md'), join(ENGINE_DATA, 'voice-dna.md'),
  join(ENGINE_DATA, 'config/profile.yml'), join(ENGINE_DATA, 'config/cv-facts.json'),
  join(ENGINE_DATA, 'modes/_profile.md'), join(ENGINE_DATA, 'modes/_brief.md'), join(ENGINE_DATA, 'modes/_custom.md'),
  join(ENGINE_DATA, 'interview-prep/story-bank.md'),
  join(CONTEXT_DIR, 'base-resume.json'), join(CONTEXT_DIR, 'experience-library.md'), join(CONTEXT_DIR, 'career-plan.md'),
  join(CONTEXT_DIR, 'qa-master.md'), join(CONTEXT_DIR, 'target-companies.json'),
];

function archiveCandidate() {
  const dir = join(DATA_DIR, 'previous-candidate', new Date().toISOString().replace(/[:.]/g, '-'));
  for (const file of CANDIDATE_FILES.filter(existsSync)) {
    const to = join(dir, file.slice(file.startsWith(ENGINE_DATA) ? ENGINE_DATA.length + 1 : CONTEXT_DIR.length + 1).replace(/\//g, '__'));
    mkdirSync(dir, { recursive: true });
    renameSync(file, to);
  }
}

/** Remove prior-candidate job tracking and generated work while retaining app settings and source code. */
export function resetCandidateWorkspace() {
  db.exec('PRAGMA secure_delete = ON');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`DELETE FROM queue; DELETE FROM interviews; DELETE FROM inbox_seen; DELETE FROM job_history;
      DELETE FROM jobs; DELETE FROM events; DELETE FROM runs; DELETE FROM contacts; DELETE FROM kv WHERE key = 'engine_update';`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE)');
  archiveCandidate();

  for (const path of [
    JOBS_OUT, join(OUTPUT_DIR, 'base'),
    join(ENGINE_DATA, 'reports'), join(ENGINE_DATA, 'output'), join(ENGINE_DATA, 'jds'),
    join(ENGINE_DATA, 'batch'), join(ENGINE_DATA, 'inbox'),
  ]) rmSync(path, { recursive: true, force: true });
  rmSync(join(ENGINE_DATA, 'portals.yml.template-backup'), { force: true });

  const data = join(ENGINE_DATA, 'data');
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, 'applications.md'), '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n');
  for (const name of ['status-log.tsv', 'pipeline.md', 'scan-history.tsv', 'pdf-index.tsv', 'blacklist.md']) {
    rmSync(join(data, name), { force: true });
  }
  writeFileSync(join(data, 'pipeline.md'), '# Pipeline — Pending URLs\n\nPaste job URLs below as `- [ ] {url}` then run the scout.\n\n## Pending\n\n## Processed\n');
  writeFileSync(join(data, 'blacklist.md'), '# Candidate Blacklist\n\n| Company | Scope | Reason | Added |\n|---------|-------|--------|-------|\n');
  mkdirSync(join(ENGINE_DATA, 'inbox'), { recursive: true });
}
