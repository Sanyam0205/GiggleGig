import { copyFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR, CONTEXT_DIR } from './paths.ts';

export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters';

export interface TargetCompany {
  name: string;
  tier?: 1 | 2 | 3;
  ats?: Ats;
  slug?: string;
  careersUrl?: string;
  visaSponsor?: boolean;
  notes?: string;
}

export type AgentProvider = 'claude' | 'codex';

export interface AgentRoute {
  provider: AgentProvider;
  model: string;
  effort?: string;
  /** Where the run goes if this provider is logged out, missing or out of plan usage. */
  fallback?: AgentRoute;
}

export interface SearchConfig {
  queries: string[];
  titleInclude: string[];
  titleExclude: string[];
  locations: string[];
  remote: { accept: boolean };
  maxAgeDays: number;
  thresholds: { skip: number; apply: number };
  /** auto: the briefing tailors every shortlisted role ≥ autoTailorMin. manual: you press Tailor on the desk. */
  automation: { tailor: 'auto' | 'manual'; autoTailorMin: number };
  alerts: { enabled: boolean; minFit: number; server: string };
  fastlane: { enabled: boolean; everyMinutes: number; tier: number; hoursOld: number; queries: number; jsearchCalls: number };
  inbox: { enabled: boolean; lookbackHours: number };
  engine: { enabled: boolean; triageBatch: number; evaluatePerRun: number; evaluateFastlane: number };
  sources: {
    ats: boolean;
    jobspy: { enabled: boolean; sites: string[]; locations: string[]; country: string; resultsPerQuery: number; hoursOld: number };
    remoteok: boolean;
    remotive: boolean;
    hackernews: boolean;
    gmailAlerts: { enabled: boolean; lookbackDays: number };
    webSearch: { enabled: boolean; maxQueries: number };
    apis: { jsearch: boolean; adzuna: boolean; jooble: boolean; places: string[]; jsearchPerRun: number; adzunaPerRun: number; jooblePerRun: number };
  };
  /** Which provider and model runs each agent role; `default` covers any role not named. */
  agents: { routes: Record<string, AgentRoute> & { default: AgentRoute } };
  limits: { scoreBatchSize: number; maxScoredPerRun: number; maxTailoredPerRun: number };
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** The working copy lives outside git (it holds one candidate's search); a fresh install starts from the neutral defaults. */
export function loadSearch(): SearchConfig {
  const live = join(CONFIG_DIR, 'search.json');
  if (!existsSync(live)) copyFileSync(join(CONFIG_DIR, 'search.default.json'), live);
  return readJson<SearchConfig>(live, null as never);
}

/** Shallow-merge a patch into config/search.json (used by the desk's settings toggles). */
export function saveSearch(patch: (cfg: SearchConfig) => void) {
  const cfg = loadSearch();
  patch(cfg);
  writeFileSync(join(CONFIG_DIR, 'search.json'), JSON.stringify(cfg, null, 2) + '\n');
  return cfg;
}

export function loadTargets(): TargetCompany[] {
  return readJson<{ companies: TargetCompany[] }>(join(CONTEXT_DIR, 'target-companies.json'), { companies: [] }).companies;
}

export function readContext(name: string): string {
  const p = join(CONTEXT_DIR, name);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
