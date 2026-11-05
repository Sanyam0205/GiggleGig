// career-ops two-pass triage: a cheap go/no-go on each sourced role using only modes/_brief.md (modes/triage.md).
// We batch several postings per call and keep the engine's exact output line, so verdicts match its own triage.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, setJobStatus, withLock } from '../db.ts';
import { pool, startRun } from '../agent.ts';
import { loadSearch, preferenceRules } from '../config.ts';
import { ENGINE_DATA, ENGINE_DIR, ENGINE_FILES, yaml } from './paths.ts';
import { engineAgent, engineScript } from './run.ts';
import { to100 } from './reports.ts';

const clip = (s: string | null, n: number) => (s && s.length > n ? s.slice(0, n) + ' […]' : s ?? '');

/** Scanned boards list a title and a link only. The engine reads most of those JDs from the ATS API for free. */
async function fillMissingJds(jobs: any[], log: (s: string) => void) {
  const missing = jobs.filter((j) => !j.description && (j.apply_url ?? j.url));
  if (!missing.length) return;
  const save = db.prepare('UPDATE jobs SET description = ? WHERE id = ?');
  let filled = 0;
  await pool(missing, 6, async (j) => {
    const r = await engineScript('fetch-jd.mjs', [j.apply_url ?? j.url], { timeoutMs: 45_000 });
    if (r.code === 0 && r.stdout.trim().length > 200) {
      j.description = r.stdout.trim();
      save.run(j.description, j.id);
      filled++;
    }
  });
  log(`Read ${filled}/${missing.length} missing job descriptions from company ATS APIs`);
}

export function triage(limit = 80) {
  return withLock('triage', { triaged: 0, busy: true } as any, () => triageNow(limit));
}

async function triageNow(limit: number) {
  const cfg = loadSearch();
  const run = startRun('triage');
  const jobs = db.prepare(`SELECT id, company, title, location, remote, description, apply_url, url FROM jobs
    WHERE status = 'sourced' AND triage IS NULL AND report_num IS NULL ORDER BY first_seen DESC LIMIT ?`).all(limit) as any[];
  if (!jobs.length) { run.finish('nothing to triage'); return { triaged: 0 }; }
  await fillMissingJds(jobs, run.log);

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
      clip(j.description, 3500) || '(no JD text captured: fetch the URL with WebFetch once; if nothing comes back, return SKIP)',
    ].join('\n')).join('\n\n');
    const r = await engineAgent({
      agent: 'triage',

      tools: ['WebFetch'],
      maxTurns: 4 + batch.length,
      prompt: `${spec}\n\n---\n\n# The candidate brief (modes/_brief.md)\n\n${brief}\n\n${preferenceRules(cfg)}\n---\n\ntriage_threshold = ${threshold}. language.output = en.\nTriage EACH posting below independently with the mode above. For each one output exactly one line, prefixed with its id:\n{id} TRIAGE: {PASS|MARGINAL|FAIL|SKIP} | {Company} | {Role} | {Score}/5 | {reason ≤ 25 words}\nNo other text.\n\n${listing}`,
    });
    if (!r.ok) { failures.push(r.error ?? 'agent error'); run.log(`Batch failed: ${r.error}`); }
    for (const m of r.text.matchAll(/^\s*([0-9a-f]{12})\s+TRIAGE:\s*(PASS|MARGINAL|FAIL|SKIP)\s*\|([^|]*)\|([^|]*)\|\s*([\d.]+)\s*\/\s*5\s*\|\s*(.*)$/gm)) {
      const [, id, verdict, , , score, reason] = m;
      if (!batch.some((j) => j.id === id)) continue;
      const s = Number(score);
      put.run(JSON.stringify({ verdict, score: s, reason: reason.trim(), at: new Date().toISOString() }), to100(s), id);
      counts[verdict] = (counts[verdict] ?? 0) + 1;
      if (verdict === 'FAIL' || verdict === 'SKIP') setJobStatus(id, 'skipped', `triage ${verdict} ${s}/5: ${reason.trim()}`);
    }
  });
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') || 'no verdicts parsed';
  run.finish(summary, Object.keys(counts).length ? undefined : failures[0] ?? 'no verdicts parsed');
  return { triaged: Object.values(counts).reduce((a, b) => a + b, 0), counts };
}
