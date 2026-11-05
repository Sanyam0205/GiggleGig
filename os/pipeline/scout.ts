import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startRun } from '../agent.ts';
import { loadSearch, loadTargets, type Ats, type SearchConfig, type TargetCompany } from '../config.ts';
import { CONTEXT_DIR } from '../paths.ts';
import { fetchAts } from '../sources/ats.ts';
import { engineScan } from '../engine/scan.ts';
import { fetchHackerNews, fetchRemoteOk, fetchRemotive } from '../sources/feeds.ts';
import { fetchJobSpy } from '../sources/jobspy.ts';
import { STARTUP_BOARDS } from '../sources/startups.ts';
import { fetchGmailAlerts, fetchWebSearch } from '../sources/agents.ts';
import { fetchFirecrawl } from '../sources/firecrawl.ts';
import { fetchAdzuna, fetchJooble, fetchJSearch } from '../sources/apis.ts';
import type { RawJob } from '../sources/types.ts';
import { ingest, normCompany, type IngestStats } from './ingest.ts';

const ATS: Ats[] = ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters'];

/** Boards the agent scouts discover get polled directly from then on. */
function addBoards(boards: { company: string; ats: string; slug: string }[] = [], log: (s: string) => void) {
  const path = join(CONTEXT_DIR, 'target-companies.json');
  const file = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { companies: [] };
  const known = new Set(file.companies.map((c: TargetCompany) => normCompany(c.name)));
  let added = 0;
  for (const b of boards) {
    if (!ATS.includes(b.ats as Ats) || !b.slug || known.has(normCompany(b.company))) continue;
    file.companies.push({ name: b.company, tier: 3, ats: b.ats, slug: b.slug, notes: 'auto-discovered by scout' });
    known.add(normCompany(b.company));
    added++;
  }
  if (added) {
    writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
    log(`Added ${added} discovered boards to target-companies.json`);
  }
}

export interface ScoutOverrides { cfg?: SearchConfig; targets?: TargetCompany[]; label?: string }

export async function scout(only?: string[], o: ScoutOverrides = {}) {
  const cfg = o.cfg ?? loadSearch();
  const targets = o.targets ?? loadTargets();
  const run = startRun(o.label ?? 'scout');
  const KEYED = ['jsearch', 'adzuna', 'jooble'];
  const on = (name: string) => !only?.length || only.includes(name) || (only.includes('apis') && KEYED.includes(name));
  const src = cfg.sources;

  // Saved as each source finishes, so a slow or hung source never holds back the others, and stopping a scout keeps what it found.
  const stats: IngestStats = { seen: 0, inserted: 0, merged: 0, filtered: 0 };
  const keep = (jobs: RawJob[]) => {
    const s = ingest(jobs, cfg);
    for (const k of Object.keys(stats) as (keyof IngestStats)[]) stats[k] += s[k];
  };
  const tasks: Promise<void>[] = [];
  const guard = (name: string, p: Promise<RawJob[]>) =>
    tasks.push(p.then(keep).catch((e) => { run.log(`${name} failed: ${e.message ?? e}`); }));

  // career-ops scan.mjs (55+ providers, liveness, dedupe) owns company boards; our own poller is the fallback.
  if (src.ats && on('ats')) guard('ats', cfg.engine?.enabled ? engineScan(run.log) : fetchAts(targets, run.log));
  if (src.jobspy.enabled && on('jobspy')) guard('jobspy', fetchJobSpy(cfg, run.log, keep));
  if (src.apis.jsearch && on('jsearch')) guard('jsearch', fetchJSearch(cfg, run.log));
  if (src.apis.adzuna && on('adzuna')) guard('adzuna', fetchAdzuna(cfg, run.log));
  if (src.apis.jooble && on('jooble')) guard('jooble', fetchJooble(cfg, run.log));
  if (src.remoteok && on('remoteok')) guard('remoteok', fetchRemoteOk(run.log));
  if (src.remotive && on('remotive')) guard('remotive', fetchRemotive(run.log));
  if (src.hackernews && on('hackernews')) guard('hackernews', fetchHackerNews(run.log));
  if (src.startups?.enabled && on('startups')) {
    for (const name of src.startups.boards) if (STARTUP_BOARDS[name]) guard(name, STARTUP_BOARDS[name](cfg, run.log));
  }
  if (src.gmailAlerts.enabled && on('gmail')) {
    guard('gmail', fetchGmailAlerts(cfg, run.log).then((r) => (addBoards(r.boards, run.log), r.jobs)));
  }
  if (src.firecrawl?.enabled && on('firecrawl')) {
    guard('firecrawl', fetchFirecrawl(cfg, targets, run.log).then((r) => (addBoards(r.boards, run.log), r.jobs)));
  }
  if (src.webSearch.enabled && on('web')) {
    guard('web', fetchWebSearch(cfg, targets, run.log).then((r) => (addBoards(r.boards, run.log), r.jobs)));
  }

  await Promise.all(tasks);
  const summary = `${stats.seen} seen · ${stats.inserted} new · ${stats.merged} already known · ${stats.filtered} filtered out`;
  run.log(summary);
  run.finish(summary);
  return stats;
}
