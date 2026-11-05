// career-ops two-pass triage: a cheap go/no-go on each sourced role using only modes/_brief.md (modes/triage.md).
// We batch several postings per call and keep the engine's exact output line, so verdicts match its own triage.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, setJobStatus, withLock } from '../db.ts';
import { pool, startRun } from '../agent.ts';
import { loadSearch, preferenceRules } from '../config.ts';
import { ENGINE_DATA, ENGINE_DIR, ENGINE_FILES, yaml } from './paths.ts';
import { engineAgent } from './run.ts';
import { fillJds } from '../pipeline/jd.ts';
import { to100 } from './reports.ts';

const clip = (s: string | null, n: number) => (s && s.length > n ? s.slice(0, n) + ' […]' : s ?? '');

export function triage(limit = 80, ids?: string[]) {
  return withLock('triage', { triaged: 0, busy: true } as any, () => triageNow(limit, ids));
}

async function triageNow(limit: number, ids?: string[]) {
  const cfg = loadSearch();
  const run = startRun('triage');
  const pick = `SELECT id, company, title, location, remote, description, apply_url, url, jd_status FROM jobs
    WHERE status = 'sourced' AND triage IS NULL AND report_num IS NULL`;
  const select = () => (ids?.length
    ? db.prepare(`${pick} AND id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : db.prepare(`${pick} ORDER BY first_seen DESC LIMIT ?`).all(limit)) as any[];
  if (!select().length) { run.finish('nothing to triage'); return { triaged: 0 }; }
  // The full description first: a verdict on a snippet is a guess.
  await fillJds(run.log, ids?.length ? ids : select().map((j) => j.id));
  const jobs = select();
  if (!jobs.length) { run.finish('every posting was already closed'); return { triaged: 0 }; }

  const threshold = Number(yaml.load(readFileSync(ENGINE_FILES.profile, 'utf8'))?.pipeline?.triage_threshold ?? 3.5);
  const spec = readFileSync(join(ENGINE_DIR, 'modes/triage.md'), 'utf8');
  const brief = readFileSync(join(ENGINE_DATA, 'modes/_brief.md'), 'utf8');
  const batches: any[][] = [];
  for (let i = 0; i < jobs.length; i += cfg.engine.triageBatch) batches.push(jobs.slice(i, i + cfg.engine.triageBatch));
  run.log(`Triage of ${jobs.length} role(s) in ${batches.length} batch(es), threshold ${threshold}`);

  const put = db.prepare(`UPDATE jobs SET triage = ?, fit_score = COALESCE(score5 * 20, ?), updated_at = datetime('now') WHERE id = ?`);
  const counts: Record<string, number> = {};
  const failures: string[] = [];
  await pool(batches, 2, async (batch) => {
    const listing = batch.map((j) => [
      `=== POSTING ${j.id}`,
      `Company: ${j.company} · Role: ${j.title} · Location: ${j.location ?? 'n/a'}${j.remote ? ' (remote)' : ''} · URL: ${j.apply_url ?? j.url ?? 'n/a'}`,
      j.jd_status === 'full' ? clip(j.description, 8000)
        : `(Only part of the job description could be read: judge what is here, and say "JD incomplete" in the reason.)\n${clip(j.description, 8000) || '(nothing)'}`,
    ].join('\n')).join('\n\n');
    const r = await engineAgent({
      agent: 'triage',
      tools: [],
      maxTurns: 4 + batch.length,
      prompt: `${spec}\n\n---\n\n# The candidate brief (modes/_brief.md)\n\n${brief}\n\n${preferenceRules(cfg)}\n---\n\ntriage_threshold = ${threshold}. language.output = en.\nTriage EACH posting below independently with the mode above. For each one output exactly one line, prefixed with its id:\n{id} TRIAGE: {PASS|MARGINAL|FAIL|SKIP} | {Company} | {Role} | {Score}/5 | {reason ≤ 25 words}\nNo other text.\n\n${listing}`,
    });
    if (!r.ok) { failures.push(r.error ?? 'agent error'); run.log(`Batch failed: ${r.error}`); }
    for (const m of r.text.matchAll(/^\s*([0-9a-f]{12})\s+TRIAGE:\s*(PASS|MARGINAL|FAIL|SKIP)\s*\|([^|]*)\|([^|]*)\|\s*([\d.]+)\s*\/\s*5\s*\|\s*(.*)$/gm)) {
      const [, id, verdict, , , score, reason] = m;
      if (!batch.some((j) => j.id === id)) continue;
      const job = batch.find((j) => j.id === id);
      // Without the full description a role can be promising, never a pass: it waits for a human look at the posting.
      const capped = verdict === 'PASS' && job?.jd_status !== 'full';
      const v = capped ? 'MARGINAL' : verdict;
      const s = capped ? Math.min(Number(score), 3.4) : Number(score);
      const why = capped ? `JD incomplete: ${reason.trim()}` : reason.trim();
      put.run(JSON.stringify({ verdict: v, score: s, reason: why, at: new Date().toISOString(), jd: job?.jd_status ?? null }), to100(s), id);
      counts[v] = (counts[v] ?? 0) + 1;
      if (v === 'FAIL' || v === 'SKIP') setJobStatus(id, 'skipped', `triage ${v} ${s}/5: ${why}`);
    }
  });
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') || 'no verdicts parsed';
  run.finish(summary, Object.keys(counts).length ? undefined : failures[0] ?? 'no verdicts parsed');
  return { triaged: Object.values(counts).reduce((a, b) => a + b, 0), counts };
}
