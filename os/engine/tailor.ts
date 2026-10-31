// CV tailoring with the career-ops pdf mode: keywords → skill gap → tailored payload → title/structure checks →
// build-cv-html → verify-cv-facts (hard gate) → generate-pdf (one A4 page) → keyword coverage.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { db, setJobStatus } from '../db.ts';
import { addQueue, getJob } from '../store.ts';
import { ENGINE_DATA } from './paths.ts';
import { engineAgent, engineScript, ENGINE_TOOLS } from './run.ts';
import { evaluateJob } from './evaluate.ts';
import { parseReport } from './reports.ts';
import { alertSlip } from '../notify.ts';

/** Latest CV PDF + HTML the engine recorded for a report (data/pdf-index.tsv). */
export function pdfFor(reportNum: string) {
  const idx = join(ENGINE_DATA, 'data/pdf-index.tsv');
  if (!existsSync(idx)) return null;
  const rows = readFileSync(idx, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'))
    .filter((c) => c[0].replace(/^0+/, '') === reportNum.replace(/^0+/, '') && (!c[5] || c[5] === 'cv'));
  const last = rows.at(-1);
  return last ? { pdf: join(ENGINE_DATA, last[1]), html: last[2] ? join(ENGINE_DATA, last[2]) : null, date: last[4] } : null;
}

export async function tailorWithEngine(jobId: string, notes?: string) {
  let job = getJob(jobId);
  if (!job.report_num) {
    const ev = await evaluateJob(jobId);
    if (!ev.ok) throw new Error(`evaluation failed before tailoring: ${ev.error}`);
    job = getJob(jobId);
  }
  const before = job.status;
  const claimed = db.prepare(`UPDATE jobs SET status = 'tailoring', updated_at = datetime('now') WHERE id = ? AND status != 'tailoring'`).run(jobId);
  if (!claimed.changes) return { ok: false, error: 'already being tailored' };
  setJobStatus(jobId, 'tailoring', `tailoring CV · report ${job.report_num}`);
  const started = Date.now();
  const r = await engineAgent({
    agent: 'resume-tailor',
    jobId,
    tools: ENGINE_TOOLS,
    maxTurns: 90,
    timeoutMs: 30 * 60_000,
    prompt: `Run career-ops pdf mode (modes/pdf.md, full pipeline) for report #${job.report_num} (${job.report_path}): ${job.title} at ${job.company}.
The JD is archived in that report. Use cv.md as the only source of truth, the template and page_format from config/profile.yml,
and render with generate-pdf.mjs --report=${job.report_num} --max-pages=1 --strict-pages. Run verify-cv-facts.mjs and do not ship a CV it blocks.
Run keyword-match.mjs on the result. Unattended: surface every warning (title mismatch, gaps, fact-gate findings) in your final summary instead of asking.
${notes ? `The candidate's instructions for this CV: ${notes}` : ''}
End with one line: TAILORED: pdf=<path> | coverage=<percent or ?> | gaps=<comma list or none>`,
  });
  const out = pdfFor(String(job.report_num));
  const putBack = (why: string) => {
    setJobStatus(jobId, before === 'tailoring' ? 'shortlisted' : before, `tailor failed: ${why}`);
    return { ok: false, error: why };
  };
  // An earlier CV for this report must never pass as the result of this run.
  if (!out || !existsSync(out.pdf) || statSync(out.pdf).mtimeMs < started) return putBack(r.error ?? 'no new PDF produced');
  if (out.html && existsSync(out.html)) {
    const facts = await engineScript('verify-cv-facts.mjs', [out.html], { timeoutMs: 60_000 });
    if (facts.code !== 0) return putBack(`fact check blocked this CV: ${(facts.stdout + facts.stderr).trim().split('\n').slice(-3).join(' ').slice(0, 300)}`);
  }
  const line = /TAILORED:\s*pdf=([^|]+)\|\s*coverage=([^|]+)\|\s*gaps=(.*)$/m.exec(r.text);
  const coverage = line ? Number.parseFloat(line[2]) : NaN;
  const gaps = line && line[3].trim() !== 'none' ? line[3].split(',').map((g) => ({ requirement: g.trim(), suggestion: 'not in the CV: add real evidence to the candidate profile if you have it' })) : [];
  const summary = job.report_path ? parseReport(job.report_path).summary : null;
  const body = {
    applyUrl: job.apply_url ?? job.url, engine: true, report: job.report_num,
    pdf: `engine/${out.pdf.slice(ENGINE_DATA.length + 1)}`, html: out.html ? `engine/${out.html.slice(ENGINE_DATA.length + 1)}` : null,
    fit: job.score5 ?? null, decision: job.decision, coverage: Number.isFinite(coverage) ? Math.round(coverage) : null, gaps,
    strengths: summary?.top_strengths ?? [], hardStops: summary?.hard_stops ?? [], notes: r.text.slice(-1200),
  };
  const open = db.prepare(`SELECT id, body FROM queue WHERE kind = 'application' AND job_id = ? AND status IN ('pending','approved')`).get(jobId) as any;
  if (open) db.prepare('UPDATE queue SET body = ? WHERE id = ?').run(JSON.stringify({ ...JSON.parse(open.body), ...body }), open.id);
  else {
    const qid = addQueue('application', jobId, `${job.title} · ${job.company}`, body);
    void alertSlip(qid, `CV ready · ${job.company}`, `${job.title}\n${job.score5?.toFixed?.(1) ?? '?'}/5 · ${job.decision ?? ''}. Approve to open the apply page.`);
  }
  setJobStatus(jobId, 'awaiting-approval', `CV ready · coverage ${body.coverage ?? '?'}`);
  return { ok: true, pdf: out.pdf, coverage: body.coverage };
}
