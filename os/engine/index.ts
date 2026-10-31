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
  const t = await triage();
  const limit = evaluateLimit ?? cfg.engine.evaluatePerRun;
  // Company search names its candidates before triage has run: only what triage just passed moves on, up to the limit.
  const named = onlyIds && onlyIds.filter((id) => (db.prepare(`SELECT 1 FROM jobs WHERE id = ? AND status = 'sourced'
    AND json_extract(triage, '$.verdict') = 'PASS' AND report_num IS NULL`).get(id))).slice(0, limit);
  const e = await evaluatePending(limit, named);
  syncFromTracker();
  return { triage: t, evaluate: e };
}
