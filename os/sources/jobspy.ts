import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { SearchConfig } from '../config.ts';
import { findPython } from '../paths.ts';
import { toIso, type Log, type RawJob } from './types.ts';

/** Slow (minutes per query), so each query's rows go to `onBatch` as soon as it finishes. */
export async function fetchJobSpy(cfg: SearchConfig, log: Log, onBatch: (jobs: RawJob[]) => void): Promise<RawJob[]> {
  const python = findPython();
  if (!python) {
    log('JobSpy skipped: no Python ≥ 3.10. Run: python3.10 -m venv .venv && .venv/bin/pip install python-jobspy');
    return [];
  }
  const { sites, locations, country, resultsPerQuery, hoursOld } = cfg.sources.jobspy;
  const args = JSON.stringify({ queries: cfg.queries, locations, country, sites, resultsPerQuery, hoursOld, remoteOnly: Boolean(cfg.remote.only) });
  const script = join(import.meta.dirname, 'jobspy_scrape.py');

  return new Promise((resolve) => {
    let jobs: RawJob[] = [];
    let total = 0;
    const by: Record<string, number> = {};
    const flush = () => {
      for (const j of jobs) by[j.source] = (by[j.source] ?? 0) + 1;
      total += jobs.length;
      if (jobs.length) onBatch(jobs);
      jobs = [];
    };
    const child = spawn(python, ['-I', script, args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const row = JSON.parse(line);
        if (row.error) log(`JobSpy: ${row.error}`);
        else if (row.progress) { flush(); log(`JobSpy ${row.progress}`); }
        else if (row.title) jobs.push({ ...row, postedAt: toIso(row.postedAt) });
      } catch { /* ignore non-JSON noise */ }
    });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => {
      if (code !== 0) log(`JobSpy exited ${code}: ${stderr.trim().split('\n').slice(-2).join(' ')}`);
      flush();
      log(`JobSpy → ${total} postings ${JSON.stringify(by)}`);
      resolve([]);
    });
  });
}
