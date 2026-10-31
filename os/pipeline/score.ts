import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, setJobStatus } from '../db.ts';
import { pool, runAgent, startRun } from '../agent.ts';
import { loadSearch, loadTargets, readContext } from '../config.ts';
import { ROOT } from '../paths.ts';
import { normCompany } from './ingest.ts';
import { alertNewMatches } from '../notify.ts';

const dim = { type: 'integer', minimum: 0, maximum: 100 };
const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          dimensions: {
            type: 'object',
            properties: { stack: dim, level: dim, domain: dim, company: dim, logistics: dim },
            required: ['stack', 'level', 'domain', 'company', 'logistics'],
          },
          hardConstraintFailed: { type: 'string', description: 'Which hard constraint failed, or empty' },
          verdict: { type: 'string', enum: ['skip', 'referral-only', 'apply'] },
          rationale: { type: 'string', description: '2–3 sentences, specific to this candidate' },
          redFlags: { type: 'array', items: { type: 'string' } },
          salary: {
            type: 'object',
            description: 'Annual base/fixed pay. Use the posted range when present (estimated=false); otherwise estimate for this company, level and city (estimated=true). INR as full rupees (e.g. 1200000), USD for global-remote roles.',
            properties: { min: { type: 'number' }, max: { type: 'number' }, currency: { type: 'string' }, estimated: { type: 'boolean' } },
            required: ['min', 'max', 'currency', 'estimated'],
          },
          keywords: { type: 'array', items: { type: 'string' }, description: '10–15 weighted JD keywords for tailoring' },
          eligibility: {
            type: 'array',
            description: 'Placement-notice style checks, 4–6 items: CGPA/degree if the JD states any, years of experience vs required, the 2–3 must-have skills, location/remote, any dealbreaker. Short labels like "0–2 yrs", "Python", "Java", "Bengaluru".',
            items: {
              type: 'object',
              properties: {
                criterion: { type: 'string', description: 'Short label, e.g. "CGPA 8.04 ≥ 7", "0–2 yrs", "FastAPI", "Java"' },
                status: { type: 'string', enum: ['met', 'unmet', 'unknown'], description: 'met = library evidence; unmet = clearly not; unknown = JD silent' },
              },
              required: ['criterion', 'status'],
            },
          },
          evidence: { type: 'string', description: 'One sentence: the JD ask, then the single strongest true line from the experience library that answers it. Mark the library part with **bold**.' },
        },
        required: ['id', 'score', 'dimensions', 'verdict', 'rationale', 'redFlags', 'salary', 'eligibility', 'evidence'],
      },
    },
  },
  required: ['scores'],
};

interface Scored {
  id: string; score: number; verdict: string; rationale: string; redFlags: string[];
  dimensions: Record<string, number>; hardConstraintFailed?: string; salary?: object; keywords?: string[];
}

const clip = (s: string | null, n: number) => (s && s.length > n ? s.slice(0, n) + '\n[…truncated]' : s ?? '');

export async function score(limit?: number) {
  const cfg = loadSearch();
  const max = limit ?? cfg.limits.maxScoredPerRun;
  const tiers = new Map(loadTargets().map((t) => [normCompany(t.name), t.tier]));
  const jobs = db.prepare(`SELECT id, company, title, location, remote, salary_min, salary_max, currency, description
      FROM jobs WHERE status = 'sourced' ORDER BY posted_at DESC NULLS LAST LIMIT ?`).all(max) as any[];

  const run = startRun('scorer');
  if (!jobs.length) {
    run.finish('nothing to score');
    return { scored: 0 };
  }

  const rubric = readFileSync(join(ROOT, 'playbook/fit-rubric.md'), 'utf8');
  const profile = [
    '## career-plan.md', clip(readContext('career-plan.md'), 6000),
    '## experience-library.md (excerpt)', clip(readContext('experience-library.md'), 9000),
    '## qa-master.md (logistics)', clip(readContext('qa-master.md'), 2000),
  ].join('\n\n');

  const batches: any[][] = [];
  for (let i = 0; i < jobs.length; i += cfg.limits.scoreBatchSize) batches.push(jobs.slice(i, i + cfg.limits.scoreBatchSize));
  run.log(`Scoring ${jobs.length} jobs in ${batches.length} batches`);

  const update = db.prepare(`UPDATE jobs SET fit_score = ?, fit = ?, updated_at = datetime('now') WHERE id = ?`);
  let scored = 0;

  await pool(batches, 2, async (batch) => {
    const listing = batch.map((j) => [
      `### id: ${j.id}`,
      `${j.title} — ${j.company} (${j.location ?? 'location n/a'}${j.remote ? ', remote' : ''})`,
      `Target-company tier: ${tiers.get(normCompany(j.company)) ?? 'not on list'}`,
      j.salary_min ? `Posted comp: ${j.salary_min}–${j.salary_max ?? '?'} ${j.currency ?? ''}` : 'Posted comp: none',
      clip(j.description, 5000) || '(no description available — score on title/company, lower confidence)',
    ].join('\n')).join('\n\n---\n\n');

    const r = await runAgent<{ scores: Scored[] }>({
      agent: 'scorer',
      tools: [],
      maxTurns: 3,
      schema: SCORE_SCHEMA,
      prompt: `${rubric}\n\nThresholds for this search: skip < ${cfg.thresholds.skip}, apply ≥ ${cfg.thresholds.apply}.\n\n# Candidate\n${profile}\n\n# Jobs to score\n${listing}\n\nReturn one entry per job id.`,
    });
    for (const s of r.data?.scores ?? []) {
      if (!batch.some((j) => j.id === s.id)) continue;
      update.run(s.score, JSON.stringify(s), s.id);
      const status = s.score >= cfg.thresholds.apply ? 'shortlisted' : s.score >= cfg.thresholds.skip ? 'needs-referral' : 'skipped';
      setJobStatus(s.id, status, `fit ${s.score}`);
      scored++;
    }
  });

  run.finish(`${scored}/${jobs.length} jobs scored`);
  await alertNewMatches();
  return { scored };
}
