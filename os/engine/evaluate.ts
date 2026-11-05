// Full A–G evaluation of one job with the career-ops batch worker spec, run safely through our agent runner.
// Mirrors batch/batch-runner.sh: reserve a report number, prefetch the JD, resolve the worker prompt with the data-root
// and personalization blocks, run the worker, then merge the tracker. Unlike the runner we never pass
// --dangerously-skip-permissions: the worker gets ENGINE_TOOLS only.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, setJobStatus, withLock } from '../db.ts';
import { pool, startRun } from '../agent.ts';
import { loadSearch, preferenceRules } from '../config.ts';
import { getJob } from '../store.ts';
import { ENGINE_DATA, ENGINE_DIR, ENGINE_FILES, yaml } from './paths.ts';
import { engineAgent, engineScript } from './run.ts';
import { applyReport, bucketFor, parseReport, reportPath } from './reports.ts';
import { alertNewMatches } from '../notify.ts';

const today = () => new Date().toISOString().slice(0, 10);

function profile() {
  return yaml.load(readFileSync(ENGINE_FILES.profile, 'utf8')) ?? {};
}

const MAX_EVAL_FAILURES = 2;

/** A posting that keeps failing must not be retried at the head of every run, ahead of everything behind it. */
function noteFailure(jobId: string) {
  db.prepare(`UPDATE jobs SET triage = json_set(triage, '$.evalFailed', COALESCE(json_extract(triage, '$.evalFailed'), 0) + 1) WHERE id = ? AND triage IS NOT NULL`).run(jobId);
}

/** The worker system prompt, resolved exactly like batch-runner.sh does (stable text so it prompt-caches). */
function resolvedPrompt(): string {
  const dir = join(ENGINE_DATA, 'batch');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, '.resolved-prompt-os.md');
  let text = readFileSync(join(ENGINE_DIR, 'batch/batch-prompt.md'), 'utf8')
    .replaceAll('{{URL}}', '<URL from the job message>')
    .replaceAll('{{JD_FILE}}', '<JD file from the job message>')
    .replaceAll('{{REPORT_NUM}}', '<report number from the job message>')
    .replaceAll('{{DATE}}', '<date from the job message>')
    .replaceAll('{{ID}}', '<batch ID from the job message>');
  text += `\n\n---\n\n## Runtime paths: data root outside the checkout\n\nThis install keeps the user layer in a separate data root. The profile for this run is \`${ENGINE_FILES.profile}\`. Where this prompt names \`config/profile.yml\`, read that file instead. Wherever this prompt names one of the paths below, resolve it under the data root, not the working directory:\n\nData root: ${ENGINE_DATA}\n\n\`cv.md\`, \`article-digest.md\`, \`modes/_profile.md\`, \`modes/_custom.md\`, \`reports/\`, \`output/\`, \`data/\`, \`interview-prep/\`, \`batch/tracker-additions/\`\n\nWrite the report under \`reports/\` in the data root and the tracker TSV under \`batch/tracker-additions/\` in the data root, and give scripts absolute data-root paths for these files. Markdown links written inside the report and the tracker TSV keep the relative form this prompt shows (\`reports/...\`). Every other path (\`templates/\`, the \`.mjs\` scripts, the other \`modes/\` files) stays relative to the working directory.\n`;
  for (const f of ['modes/_profile.md', 'config/profile.yml', 'modes/_custom.md']) {
    const p = join(ENGINE_DATA, f);
    if (existsSync(p)) text += `\n\n---\n\n## Runtime personalization: ${f}\n\n${readFileSync(p, 'utf8').replace(/^/gm, '    ')}\n`;
  }
  const prefs = preferenceRules(loadSearch());
  if (prefs) text += `\n\n---\n\n## Runtime personalization: settings\n\n${prefs.replace(/^/gm, '    ')}\n`;
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
  return path;
}

async function reserve(): Promise<string> {
  const r = await engineScript('reserve-report-num.mjs');
  const num = /(\d{3,})/.exec(r.stdout)?.[1];
  if (!num) throw new Error(`could not reserve a report number: ${r.stderr || r.stdout}`);
  return num;
}

/** JD text for the worker: what we already captured, else the engine's zero-browser ATS fetch. */
async function jdFile(job: any): Promise<string | null> {
  mkdirSync(join(ENGINE_DATA, 'jds'), { recursive: true });
  const path = join(ENGINE_DATA, 'jds', `os-${job.id}.md`);
  let text = job.description && job.description.length > 400 ? job.description : '';
  if (!text && job.url) {
    const r = await engineScript('fetch-jd.mjs', [job.apply_url ?? job.url], { timeoutMs: 60_000 });
    if (r.code === 0 && r.stdout.trim().length > 200) text = r.stdout;
  }
  if (!text) return null;
  writeFileSync(path, `# ${job.title} — ${job.company}\n\n**Location:** ${job.location ?? 'n/a'}\n**URL:** ${job.apply_url ?? job.url ?? 'n/a'}\n\n${text}\n`);
  return path;
}

function finalJson(text: string): any {
  const matches = [...text.matchAll(/\{[^{}]*"status"\s*:\s*"(completed|failed|skipped|needs_confirmation)"[\s\S]*?\}/g)];
  for (const m of matches.reverse()) { try { return JSON.parse(m[0]); } catch { /* keep looking */ } }
  return null;
}

export async function evaluateJob(jobId: string, answer?: string): Promise<{ ok: boolean; score?: number; decision?: string; error?: string }> {
  const job = getJob(jobId);
  // Claim first: only one process, ever, evaluates a job at a time.
  const claimed = db.prepare(`UPDATE jobs SET status = 'evaluating', updated_at = datetime('now') WHERE id = ? AND status != 'evaluating'`).run(jobId);
  if (!claimed.changes) return { ok: false, error: 'already being evaluated' };
  const putBack = (why: string) => {
    db.prepare('UPDATE jobs SET pending_report = NULL WHERE id = ?').run(jobId);
    noteFailure(jobId);
    setJobStatus(jobId, job.status === 'evaluating' ? 'sourced' : job.status, `evaluation failed: ${why}`);
    return { ok: false, error: why };
  };
  let num: string;
  let jd: string | null;
  try {
    jd = await jdFile(job);
    num = await reserve();
  } catch (e: any) { return putBack(e.message); }
  const id = `os-${jobId}`;
  db.prepare('UPDATE jobs SET pending_report = ? WHERE id = ?').run(num, jobId);
  setJobStatus(jobId, 'evaluating', `report ${num}`);
  const prompt = [
    'Process this job offer. Run the pipeline: A-G evaluation + report .md + tracker line. Do not generate PDF; write ❌ in the tracker PDF column and set "pdf": null in the final JSON.',
    `URL: ${job.apply_url ?? job.url ?? `local:jds/os-${jobId}.md`}`,
    `JD file: ${jd ?? '(none prefetched: fetch the JD from the URL)'}`,
    `Report number: ${num}`,
    `Date: ${today()}`,
    `Batch ID: ${id}`,
    // The worker only accepts an agency confirmation that comes from the candidate, relayed here.
    answer ? `The candidate's explicit answer about the recruiting agency on this exact posting: ${answer}` : '',
  ].join(' ').trim();

  const r = await engineAgent({
    agent: 'evaluate',
    role: `evaluate:${['economy', 'premium'].includes(profile().spend_tier) ? profile().spend_tier : 'standard'}`,
    jobId,
    appendSystemFile: resolvedPrompt(),
    prompt,
    maxTurns: 70,
    timeoutMs: 30 * 60_000,
  });

  const out = finalJson(r.text);
  const path = reportPath(num);
  // Two refusals the worker makes on purpose, with no report. Neither is a failure, and retrying would only repeat them.
  if (!path && out?.status === 'skipped') {
    await engineScript('merge-tracker.mjs');
    await engineScript('reserve-report-num.mjs', ['--release', num]);
    db.prepare('UPDATE jobs SET pending_report = NULL WHERE id = ?').run(jobId);
    setJobStatus(jobId, 'skipped', `dealbreaker: ${out.rule ?? out.reason ?? 'not stated'}`);
    return { ok: true, decision: 'Skip' };
  }
  if (!path && out?.status === 'needs_confirmation') {
    await engineScript('reserve-report-num.mjs', ['--release', num]);
    db.prepare(`UPDATE jobs SET pending_report = NULL, triage = json_set(COALESCE(triage, '{}'), '$.blocked', ?) WHERE id = ?`).run(String(out.question ?? 'The worker needs your confirmation.'), jobId);
    setJobStatus(jobId, 'sourced', `needs your answer: ${out.reason ?? 'confirmation'}`);
    return { ok: false, error: `needs your answer: ${out.question ?? out.reason}` };
  }
  if (!path) {
    await engineScript('reserve-report-num.mjs', ['--release', num]);
    return putBack(out?.error ?? r.error ?? 'no report written');
  }
  const parsed = parseReport(path);
  if (!parsed.summary || !Number.isFinite(Number(parsed.summary.score))) {
    await engineScript('reserve-report-num.mjs', ['--release', num]);
    return putBack(`report ${num} has no usable Machine Summary`);
  }
  await engineScript('merge-tracker.mjs');
  await engineScript('reserve-report-num.mjs', ['--release', num]);
  const { score, decision } = applyReport(jobId, parsed);
  db.prepare('UPDATE jobs SET pending_report = NULL WHERE id = ?').run(jobId);
  setJobStatus(jobId, bucketFor(decision, score), `evaluated ${score.toFixed(1)}/5 · ${decision ?? ''} · report ${num}`);
  if (jd && existsSync(jd)) unlinkSync(jd);
  return { ok: true, score, decision };
}

/** Evaluate the best triaged jobs, bounded so the subscription isn't drained. */
export async function evaluatePending(limit = 6, ids?: string[], answer?: string) {
  // Named jobs are an explicit request; the sweep over what triage passed runs once at a time across processes.
  return ids ? evaluateNow(limit, ids, answer) : withLock('evaluate', { evaluated: 0, busy: true } as any, () => evaluateNow(limit));
}

async function evaluateNow(limit: number, ids?: string[], answer?: string) {
  const run = startRun('evaluate:batch');
  const targets = ids ?? (db.prepare(`SELECT id FROM jobs WHERE status = 'sourced' AND triage IS NOT NULL
      AND json_extract(triage, '$.verdict') = 'PASS' AND report_num IS NULL
      AND COALESCE(json_extract(triage, '$.evalFailed'), 0) < ${MAX_EVAL_FAILURES} AND json_extract(triage, '$.blocked') IS NULL
      ORDER BY json_extract(triage, '$.score') DESC, first_seen DESC LIMIT ?`).all(limit) as any[]).map((r) => r.id as string);
  if (!targets.length) { run.finish('nothing passed triage'); return { evaluated: 0 }; }
  run.log(`Full A–G evaluation of ${targets.length} role(s)`);
  let ok = 0;
  await pool(targets, 2, async (id) => {
    const res = await evaluateJob(id, answer).catch((e) => ({ ok: false, error: e.message }));
    const j = db.prepare('SELECT company, title FROM jobs WHERE id = ?').get(id) as any;
    run.log(`${j?.company} · ${j?.title}: ${res.ok ? `${(res as any).score?.toFixed?.(1)}/5 · ${(res as any).decision}` : `failed (${res.error})`}`);
    if (res.ok) ok++;
  });
  await engineScript('reconcile-pipeline.mjs');
  await alertNewMatches();
  run.finish(`${ok}/${targets.length} evaluated`);
  return { evaluated: ok };
}
