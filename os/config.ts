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
  /** only: drop every role that is not remote and open to `locations`. */
  remote: { accept: boolean; only?: boolean };
  maxAgeDays: number;
  thresholds: { skip: number; apply: number };
  /** auto: the briefing tailors every shortlisted role ≥ autoTailorMin. manual: you press Tailor on the desk. */
  automation: { tailor: 'auto' | 'manual'; autoTailorMin: number };
  alerts: { enabled: boolean; minFit: number; server: string };
  fastlane: { enabled: boolean; everyMinutes: number; tier: number; hoursOld: number; queries: number; jsearchCalls: number };
  inbox: { enabled: boolean; lookbackHours: number };
  /** autoEvaluate: false keeps the costly full evaluation for the roles you pick. */
  engine: { enabled: boolean; triageBatch: number; evaluatePerRun: number; evaluateFastlane: number; autoEvaluate?: boolean };
  /** The candidate's own rules. Kept in settings, so a resume upload never loses them; triage and evaluation read them every run. */
  preferences?: { minAnnualSalary?: number; currency?: string; usdToInr?: number; experience?: string; exclude?: string[]; notes?: string[] };
  sources: {
    ats: boolean;
    jobspy: { enabled: boolean; sites: string[]; locations: string[]; country: string; resultsPerQuery: number; hoursOld: number };
    remoteok: boolean;
    remotive: boolean;
    hackernews: boolean;
    gmailAlerts: { enabled: boolean; lookbackDays: number };
    webSearch: { enabled: boolean; maxQueries: number };
    /** Agent that crawls with the Firecrawl MCP server: career pages no adapter reads, and job platforms by search. */
    firecrawl?: { enabled: boolean; maxCalls: number; maxCompanies: number; platforms: string[] };
    /** Startup and remote-first boards. `boards` picks which run; the rest say what to ask each one for. */
    startups: { enabled: boolean; boards: string[]; remoteCountry: string; wellfoundLocation: string; wellfoundRoles: string[]; rocketshipRoles: string[]; skills: string[] };
    apis: { jsearch: boolean; adzuna: boolean; jooble: boolean; places: string[]; jsearchPerRun: number; adzunaPerRun: number; jooblePerRun: number };
  };
  /** Which provider and model runs each agent role; `default` covers any role not named. */
  agents: { routes: Record<string, AgentRoute> & { default: AgentRoute } };
  limits: { scoreBatchSize: number; maxScoredPerRun: number; maxTailoredPerRun: number; jsearchMonthly?: number };
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

const lpa = (n: number) => `${(n / 1e5).toFixed(n % 1e5 ? 1 : 0)} LPA`;

/** The preferences as rules for triage and evaluation prompts. Empty when none are set. */
export function preferenceRules(cfg: SearchConfig): string {
  const p = cfg.preferences ?? {};
  const rules: string[] = [];
  if (cfg.remote.only) rules.push(`Remote only, open to someone living in ${cfg.locations[0] ?? 'the candidate\'s country'}. Office, hybrid, or remote restricted to other countries = Hard DQ.`);
  if (p.minAnnualSalary) rules.push(`Pay floor: ${p.currency ?? 'INR'} ${p.minAnnualSalary.toLocaleString('en-IN')} a year (${lpa(p.minAnnualSalary)}). A posted range whose top is below it = Hard DQ. Unknown pay is neutral, but fresher packages, mass hiring and IT-services roles that usually pay below it score lower; roles that clearly pay well above it score higher.`);
  if (p.experience) rules.push(`Experience: roles asking ${p.experience} years fit best. 3+ years required, Senior, Staff, Lead or Manager = Hard DQ.`);
  if (p.exclude?.length) rules.push(`Hard DQ: ${p.exclude.join(', ')}.`);
  for (const n of p.notes ?? []) rules.push(n);
  return rules.length ? `## Candidate preferences (from GiggleGig settings; they override the brief where they differ)\n\n${rules.map((r) => `- ${r}`).join('\n')}\n` : '';
}

export function loadTargets(): TargetCompany[] {
  return readJson<{ companies: TargetCompany[] }>(join(CONTEXT_DIR, 'target-companies.json'), { companies: [] }).companies;
}

export function readContext(name: string): string {
  const p = join(CONTEXT_DIR, name);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
