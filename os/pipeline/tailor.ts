import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { db, setJobStatus } from '../db.ts';
import { CALENDAR_READ, GMAIL_DRAFT, pool, routeFor, runAgent, startRun } from '../agent.ts';
import { loadSearch } from '../config.ts';
import { getJob, jobDir, markTailored, writeJd } from '../store.ts';
import { tailorWithEngine } from '../engine/tailor.ts';

// What a skill may always do. Mail and calendar are added below; sending and calendar writes are denied in agent.ts.
const SKILL_BASE = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Agent', 'Task', 'WebFetch', 'WebSearch', 'Skill', 'Bash(node os/cli.ts:*)'];
export const SKILL_TOOLS = [...SKILL_BASE, ...GMAIL_DRAFT, ...CALENDAR_READ];
// Skills that read untrusted input and have no use for mail get no path to it.
const NO_CONNECTORS = new Set(['setup-context', 'company-research', 'application-kit', 'referral-request']);

/** Run a project skill headless, the same way you'd type it in Claude Code. */
export function runSkill(skill: string, args: string, opts: { model?: string; jobId?: string; maxTurns?: number; extraTools?: string[] } = {}) {
  const tools = [...(NO_CONNECTORS.has(skill) ? SKILL_BASE : SKILL_TOOLS), ...(opts.extraTools ?? [])];
  const route = routeFor({ agent: skill, model: opts.model, tools: tools.filter((t) => !t.startsWith('mcp__')) });
  const unattended = 'You are running unattended from the GiggleGig scheduler: do not ask questions; make reasonable choices, note assumptions in your final summary, and follow the CLAUDE.md ground rules.';
  return runAgent({
    agent: skill,
    jobId: opts.jobId,
    model: opts.model,
    tools: route.provider === 'codex' ? tools.filter((t) => !t.startsWith('mcp__')) : tools,
    maxTurns: opts.maxTurns ?? 60,
    // Slash commands are a Claude Code feature; Codex is pointed at the same skill file.
    prompt: route.provider === 'codex'
      ? `Read CLAUDE.md, then .claude/skills/${skill}/SKILL.md, and carry out that skill with these arguments: ${args}\n\n${unattended}`
      : `/${skill} ${args}\n\n${unattended}`,
  });
}

export async function tailor(ids?: string[], notes?: string) {
  const cfg = loadSearch();
  const run = startRun('tailor');
  // Explicit ids (the desk's Tailor button, the CLI) always run; the scheduled sweep only runs in auto mode.
  if (!ids?.length && cfg.automation.tailor === 'manual') {
    run.finish('tailoring is manual — press Tailor on the desk');
    return { tailored: 0 };
  }
  const targets = ids?.length
    ? ids
    : (db.prepare(`SELECT id FROM jobs WHERE status = 'shortlisted' AND fit_score >= ? ORDER BY fit_score DESC LIMIT ?`)
        .all(cfg.automation.autoTailorMin, cfg.limits.maxTailoredPerRun) as any[]).map((r) => r.id);
  if (!targets.length) {
    run.finish('no shortlisted jobs to tailor');
    return { tailored: 0 };
  }
  run.log(`Tailoring ${targets.length}: ${targets.join(', ')}`);

  let done = 0;
  if (cfg.engine?.enabled) {
    await pool(targets, 1, async (id) => {
      const job = getJob(id);
      const r = await tailorWithEngine(id, notes).catch((e) => ({ ok: false, error: e.message }) as any);
      run.log(`${job.company} · ${job.title}: ${r.ok ? `CV ready, coverage ${r.coverage ?? '?'}` : `failed (${r.error})`}`);
      if (r.ok) done++;
    });
    run.finish(`${done}/${targets.length} CVs tailored`);
    return { tailored: done };
  }
  await pool(targets, 2, async (id) => {
    const job = getJob(id);
    writeJd(job);
    const before = job.status;
    setJobStatus(id, 'tailoring');
    const r = await runSkill('resume-tailor', notes ? `${id}\n\nThe candidate's instructions for this resume: ${notes}` : id, { jobId: id, maxTurns: 80 });
    const md = join(jobDir(id), 'resume.json');
    if (!existsSync(md)) {
      setJobStatus(id, before === 'tailoring' ? 'shortlisted' : before, `tailor failed: ${r.error ?? 'no resume.json'}`);
      run.log(`${job.company}: tailor failed (${r.error ?? 'no resume.json written'})`);
      return;
    }
    // The skill normally calls `cli tailored` itself; this is idempotent if it already did.
    const { pdf, coverage } = markTailored(id);
    run.log(`${job.company} · ${job.title}: coverage ${coverage ?? '?'}${pdf ? '' : ' (no PDF — no Chromium browser found)'}`);
    done++;
  });

  run.finish(`${done}/${targets.length} resumes tailored and queued for approval`);
  return { tailored: done };
}

/** Scheduled follow-ups (referral steps 2–3, nudges) become pending when due. */
export function promoteDue() {
  const r = db.prepare(`UPDATE queue SET status = 'pending' WHERE status = 'scheduled' AND due_at <= datetime('now')`).run();
  return Number(r.changes);
}
