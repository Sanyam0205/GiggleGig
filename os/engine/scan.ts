// The engine's zero-token portal scanner (55+ ATS providers, liveness, SimHash dedupe, scan-history),
// then its new pipeline.md entries are imported as desk jobs so triage and evaluation pick them up.
import { existsSync, readFileSync } from 'node:fs';
import type { Log, RawJob } from '../sources/types.ts';
import { ENGINE_FILES } from './paths.ts';
import { syncPortals } from './portals.ts';
import { engineScript } from './run.ts';

export async function engineScan(log: Log, extra: string[] = []): Promise<RawJob[]> {
  // Boards found since the last run (scouts, company search) only reach the scanner through portals.yml.
  const portals = syncPortals();
  if (!portals.companies) log('No company boards configured for this candidate yet');
  // Big career sites (Workday tenants with thousands of jobs) take a while; a cut-off run would lose every board's results.
  const r = await engineScript('scan.mjs', ['--quiet', ...extra], { timeoutMs: 45 * 60_000 });
  const added = /(\d+)\s+new/i.exec(r.stdout)?.[1];
  log(r.code === 0 ? `Company boards → scanned ${portals.companies}${added ? `, ${added} new offers` : ''}` : `Company board scan exited ${r.code}: ${r.stderr.trim().split('\n').slice(-2).join(' ')}`);
  return readPending();
}

/** Pending lines in data/pipeline.md: `- [ ] url | company | title`. */
export function readPending(): RawJob[] {
  if (!existsSync(ENGINE_FILES.pipeline)) return [];
  const jobs: RawJob[] = [];
  for (const line of readFileSync(ENGINE_FILES.pipeline, 'utf8').split('\n')) {
    const m = /^- \[ \]\s+(\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/.exec(line);
    if (!m || m[1].startsWith('local:')) continue;
    jobs.push({ source: 'boards', company: m[2], title: m[3], url: m[1], applyUrl: m[1] });
  }
  return jobs;
}
