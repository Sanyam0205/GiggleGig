// Keeps the company-board configuration aligned with the active candidate profile.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadSearch, loadTargets } from '../config.ts';
import { ENGINE_FILES, yaml } from './paths.ts';
import { normCompany } from '../pipeline/ingest.ts';

const BOARD_URL: Record<string, (slug: string) => string> = {
  greenhouse: (s) => `https://job-boards.greenhouse.io/${s}`,
  lever: (s) => `https://jobs.lever.co/${s}`,
  ashby: (s) => `https://jobs.ashbyhq.com/${s}`,
  workable: (s) => `https://apply.workable.com/${s}`,
  smartrecruiters: (s) => `https://jobs.smartrecruiters.com/${s}`,
};

/** Rebuild candidate-specific search filters and company boards from the active profile/config. */
export function syncPortals() {
  if (!existsSync(ENGINE_FILES.portals)) throw new Error('Candidate board configuration missing; complete resume intake first.');
  const raw = readFileSync(ENGINE_FILES.portals, 'utf8');
  const p = yaml.load(raw);
  const cfg = loadSearch();

  p.location_filter = {
    always_allow: [...cfg.locations],
    allow: [...cfg.locations],
  };
  p.title_filter = {
    ...(p.title_filter ?? {}),
    positive: [...cfg.titleInclude],
    negative: [...cfg.titleExclude],
  };
  p.search_queries = cfg.queries.map((query, i) => ({ name: `Candidate query ${i + 1}`, query, enabled: true }));

  const tracked: any[] = [];
  const byName = new Map<string, any>();
  for (const target of loadTargets()) {
    const url = target.ats && target.slug ? BOARD_URL[target.ats]?.(target.slug) : target.careersUrl;
    if (!url || byName.has(normCompany(target.name))) continue;
    const entry: any = { name: target.name, careers_url: url, enabled: true, notes: `tier ${target.tier ?? 3} candidate target (GiggleGig)` };
    if (!target.slug) entry.scan_method = 'websearch';
    tracked.push(entry);
    byName.set(normCompany(target.name), entry);
  }
  p.tracked_companies = tracked;

  const header = '# managed-by: GiggleGig — derived from the active candidate profile and search settings.\n';
  writeFileSync(ENGINE_FILES.portals, header + yaml.dump(p, { lineWidth: 160, noRefs: true }));
  return {
    companies: tracked.length,
    enabled: tracked.length,
    queries: p.search_queries.length,
    locations: cfg.locations.length,
    titles: cfg.titleInclude.length,
  };
}
