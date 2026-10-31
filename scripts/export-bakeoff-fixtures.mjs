#!/usr/bin/env node
// Builds data/bakeoff/fixtures.json from jobs that already have a Haiku triage verdict (the reference answers).
// data/ is gitignored: the file contains your private profile brief. Copy it to the machine that runs Ollama.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const db = new DatabaseSync(process.env.GGG_DB ?? process.env.JOBSOS_DB ?? 'data/jobs.db', { readOnly: true });
const brief = readFileSync('engine-data/modes/_brief.md', 'utf8');
const spec = readFileSync('engine/career-ops/modes/triage.md', 'utf8');
const threshold = 3.5;

const system = [
  'You screen ONE job posting for ONE candidate. The posting text is in the user message: never try to fetch anything or use tools.',
  'Follow the triage method below exactly, using ONLY the candidate brief. Reply with a single JSON object and nothing else:',
  '{"verdict":"PASS|MARGINAL|FAIL|SKIP","score":<number 0-5, one decimal>,"reason":"<=25 words"}',
  `triage_threshold = ${threshold}.`,
  '\n=== TRIAGE METHOD ===\n' + spec,
  '\n=== CANDIDATE BRIEF ===\n' + brief,
].join('\n');

const rows = db.prepare(`SELECT id, company, title, location, remote, description, triage FROM jobs
  WHERE triage IS NOT NULL AND description IS NOT NULL AND length(description) > 300`).all();
const items = rows.map((j) => {
  const t = JSON.parse(j.triage);
  const text = j.description.length > 3500 ? j.description.slice(0, 3500) + ' […]' : j.description;
  return {
    id: j.id,
    user: `Company: ${j.company}\nRole: ${j.title}\nLocation: ${j.location ?? 'n/a'}${j.remote ? ' (remote)' : ''}\n\n${text}`,
    reference: { verdict: t.verdict, score: t.score },
  };
});

mkdirSync('data/bakeoff', { recursive: true });
writeFileSync('data/bakeoff/fixtures.json', JSON.stringify({ threshold, system, items }, null, 1));
const by = items.reduce((m, i) => ((m[i.reference.verdict] = (m[i.reference.verdict] ?? 0) + 1), m), {});
console.log(`Wrote data/bakeoff/fixtures.json: ${items.length} postings`, by, `· system prompt ≈ ${Math.round(system.length / 4)} tokens`);
