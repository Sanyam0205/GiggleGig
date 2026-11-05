// One entry point for "score what's new": career-ops two-pass triage, then full A–G evaluation of what passes.
import { loadSearch } from '../config.ts';
import { db } from '../db.ts';
import { triage } from './triage.ts';
import { evaluatePending } from './evaluate.ts';
import { syncFromTracker } from './sync.ts';
import { score as legacyScore } from '../pipeline/score.ts';

export async function engineScore(evaluateLimit?: number, onlyIds?: string[]) {
  const cfg = loadSearch();
  if (!cfg.engine?.enabled) return legacyScore();
  let t = await triage();
  // Each pass takes 80; a big scout finishes in a few passes rather than over several runs. Triage is the cheap step.
  const left = db.prepare(`SELECT 1 FROM jobs WHERE status = 'sourced' AND triage IS NULL AND report_num IS NULL LIMIT 1`);
  for (let pass = 1; pass < 6 && t.triaged > 0 && left.get(); pass++) t = await triage();
  const limit = evaluateLimit ?? cfg.engine.evaluatePerRun;
  // Company search names its candidates before triage has run: only what triage just passed moves on, up to the limit.
  const named = onlyIds && onlyIds.filter((id) => (db.prepare(`SELECT 1 FROM jobs WHERE id = ? AND status = 'sourced'
    AND json_extract(triage, '$.verdict') = 'PASS' AND report_num IS NULL`).get(id))).slice(0, limit);
  // Full evaluation costs a few minutes of AI per role; by default it waits for the roles you pick.
  const e = cfg.engine.autoEvaluate ? await evaluatePending(limit, named) : { evaluated: 0, note: 'evaluation is manual: pick roles on Matches' };
  syncFromTracker();
  return { triage: t, evaluate: e };
}
