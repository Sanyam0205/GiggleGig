// Company search: type a name, get every feasible role there for your profile, scored.
// Order: the company's own ATS board (complete, canonical) → Google for Jobs via JSearch → a career-site agent as fallback.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db.ts';
import { runAgent, startRun } from '../agent.ts';
import { loadSearch, loadTargets } from '../config.ts';
import { CONTEXT_DIR } from '../paths.ts';
import { discoverBoard, fetchAts } from '../sources/ats.ts';
import { jsearchQuery } from '../sources/apis.ts';
import { JOBS_SCHEMA, type Found } from '../sources/agents.ts';
import { toIso, type RawJob } from '../sources/types.ts';
import { ingest, normCompany } from './ingest.ts';
import { engineScore } from '../engine/index.ts';

function rememberBoard(name: string, ats: string, slug: string) {
  const path = join(CONTEXT_DIR, 'target-companies.json');
  const file = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { companies: [] };
  const hit = file.companies.find((c: any) => normCompany(c.name) === normCompany(name));
  if (hit) { if (!hit.slug) Object.assign(hit, { ats, slug }); }
  else file.companies.push({ name, tier: 2, ats, slug, notes: 'added by company search' });
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
}

export async function searchCompany(name: string) {
  const cfg = loadSearch();
  const run = startRun(`company:${name}`);
  const found: RawJob[] = [];
  const place = cfg.sources.jobspy.locations[0] ?? cfg.locations[0] ?? '';

  // 1. Known or discoverable ATS board.
  const known = loadTargets().find((t) => normCompany(t.name) === normCompany(name) && t.slug);
  if (known) {
    found.push(...await fetchAts([known], run.log));
  } else {
    run.log(`Looking for ${name}'s job board on Greenhouse, Lever, Ashby, Workable, SmartRecruiters…`);
    const board = await discoverBoard(name);
    if (board) {
      run.log(`Found ${board.ats}/${board.slug} → ${board.jobs.length} postings; polling it in every scout from now on`);
      found.push(...board.jobs.map((j) => ({ ...j, company: name })));
      rememberBoard(name, board.ats, board.slug);
    } else run.log('No public ATS board found');
  }

  // 2. Google for Jobs (LinkedIn, Naukri, Wellfound, company site…) — two calls.
  for (const q of [`${name} software engineer ${place}`.trim(), `${name} developer ${place}`.trim()]) {
    try {
      const rows = (await jsearchQuery(q, run.log)).filter((j) => normCompany(j.company).includes(normCompany(name)) || normCompany(name).includes(normCompany(j.company)));
      run.log(`JSearch "${q}" → ${rows.length} postings at ${name}`);
      found.push(...rows);
    } catch (e: any) { run.log(`JSearch "${q}" failed: ${e.message}`); }
  }

  // 3. Career-site agent when the cheaper routes came back thin.
  if (found.length < 5) {
    const r = await runAgent<Found>({
      agent: `scout:company`,
      tools: ['WebSearch', 'WebFetch'],
      maxTurns: 30,
      schema: JOBS_SCHEMA,
      prompt: `Find ${name}'s official careers page and list every open software engineering role (backend, full-stack, AI/ML, platform, SDE)
located in ${cfg.locations.join(', ') || 'any location'} or remote from there. Use WebSearch to find the careers page, then WebFetch it (and its job-listing API/JSON if the page loads one).
For each role return company "${name}", title, location, url, the description text if available, and via:"careers-site".
If the careers page is on Greenhouse/Lever/Ashby/Workable, put that board in newBoards. Never invent postings.`,
    });
    const rows = (r.data?.jobs ?? []).map((j) => ({ ...j, source: `web:careers-site`, applyUrl: j.url, postedAt: toIso(j.postedAt) }));
    run.log(r.ok ? `Careers site → ${rows.length} postings` : `Careers-site agent failed: ${r.error}`);
    found.push(...rows);
    for (const b of r.data?.newBoards ?? []) {
      rememberBoard(name, b.ats, b.slug);
      const fromBoard = await fetchAts([{ name, ats: b.ats as any, slug: b.slug }], run.log);
      found.push(...fromBoard);
    }
  }

  const stats = ingest(found, cfg);
  run.log(`${stats.seen} seen · ${stats.inserted} new feasible · ${stats.merged} already known · ${stats.filtered} filtered (level, title, location)`);
  const fresh = (db.prepare(`SELECT id FROM jobs WHERE status = 'sourced' AND company LIKE ?`).all(`%${name}%`) as any[]).map((r) => r.id);
  await engineScore(3, fresh);
  const feasible = db.prepare(`SELECT COUNT(*) n FROM jobs WHERE status NOT IN ('filtered') AND company LIKE ?`).get(`%${name}%`) as any;
  run.finish(`${name}: ${feasible.n} feasible roles`);
  return { ...stats, feasible: feasible.n };
}
