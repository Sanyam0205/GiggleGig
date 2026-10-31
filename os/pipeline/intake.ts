// New candidate: build the profile from the resume, prove it is usable, point the search at it, then start searching.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { startRun } from '../agent.ts';
import { loadSearch } from '../config.ts';
import { setCandidateState } from '../db.ts';
import { engineScore } from '../engine/index.ts';
import { ENGINE_DATA, ENGINE_FILES } from '../engine/paths.ts';
import { syncPortals } from '../engine/portals.ts';
import { engineScript } from '../engine/run.ts';
import { push } from '../notify.ts';
import { CONTEXT_DIR } from '../paths.ts';
import { scout } from './scout.ts';
import { runSkill } from './tailor.ts';

const REQUIRED = [ENGINE_FILES.cv, ENGINE_FILES.profile, join(ENGINE_DATA, 'modes/_brief.md'), join(ENGINE_DATA, 'modes/_profile.md'), join(CONTEXT_DIR, 'base-resume.json')];

/** What is wrong with the profile the setup agent left behind, or null when the search can rely on it. */
async function problemWith(since: number): Promise<string | null> {
  const stale = REQUIRED.filter((f) => !existsSync(f) || statSync(f).mtimeMs < since);
  if (stale.length) return `not written: ${stale.map((f) => f.split('/').slice(-2).join('/')).join(', ')}`;
  if (readFileSync(ENGINE_FILES.cv, 'utf8').trim().length < 200) return 'cv.md is nearly empty';
  const cfg = loadSearch();
  if (!cfg.queries.length || !cfg.titleInclude.length) return 'no search queries or target titles were derived from the resume';
  const profile = await engineScript('validate-profile.mjs', [], { timeoutMs: 60_000 });
  if (profile.code !== 0) return `profile.yml is invalid: ${(profile.stdout + profile.stderr).trim().split('\n').slice(-2).join(' ').slice(0, 240)}`;
  const doctor = await engineScript('doctor.mjs', ['--json'], { timeoutMs: 60_000 });
  if (doctor.json?.onboardingNeeded) return `still missing: ${doctor.json.missing?.join(', ')}`;
  return null;
}

export async function intake(file: string) {
  const run = startRun('intake');
  setCandidateState('intake');
  const since = Date.now();
  const fail = (why: string) => {
    setCandidateState('failed', why);
    run.finish('intake failed', why);
    void push('Resume intake failed', why, { tags: ['warning'] });
    return { ok: false, error: why };
  };

  const r = await runSkill('setup-context', file);
  if (!r.ok) return fail(r.error ?? 'the setup agent failed');
  const problem = await problemWith(since);
  if (problem) return fail(problem);

  const portals = syncPortals();
  setCandidateState('ready');
  run.log(`Profile ready. Searching ${loadSearch().queries.length} queries and ${portals.companies} company boards for this candidate.`);
  run.finish('profile built, search started');
  await scout();
  await engineScore();
  return { ok: true };
}
