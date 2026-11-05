// Keyed job-search APIs. Each is skipped (with a log line saying why) until its key is in .env.
import type { SearchConfig } from '../config.ts';
import { kvGet, kvSet } from '../db.ts';
import { getJson, htmlToText, isRemote, toIso, type Log, type RawJob } from './types.ts';

const key = (name: string) => process.env[name]?.trim() || null;

/** JSearch's free tier is a monthly request budget; every call is counted so a run stops before overspending it. */
export function jsearchUsage(cfg?: SearchConfig) {
  const month = new Date().toISOString().slice(0, 7);
  return { month, used: Number(kvGet(`quota:jsearch:${month}`) ?? 0), limit: cfg?.limits.jsearchMonthly ?? 200 };
}
function spendJsearch(cfg: SearchConfig | undefined, log: Log) {
  const u = jsearchUsage(cfg);
  if (u.used >= u.limit) { log(`JSearch skipped: ${u.used}/${u.limit} requests used this month`); return false; }
  kvSet(`quota:jsearch:${u.month}`, String(u.used + 1));
  return true;
}

/** Search terms × places, capped so free tiers last the month. */
function searches(cfg: SearchConfig, max: number) {
  const places = cfg.sources.apis.places;
  const out: { q: string; where: string }[] = [];
  for (const q of cfg.queries) for (const where of places) out.push({ q, where });
  // Rotate through the full list across runs instead of always hitting the first few.
  const offset = Math.floor(Date.now() / 3_600_000) % Math.max(out.length, 1);
  return [...out.slice(offset), ...out.slice(0, offset)].slice(0, max);
}

/** One JSearch query (used by company search). */
export async function jsearchQuery(query: string, log: Log, datePosted = 'month'): Promise<RawJob[]> {
  const k = key('JSEARCH_API_KEY');
  if (!k) { log('JSearch skipped: no JSEARCH_API_KEY'); return []; }
  if (!spendJsearch(undefined, log)) return [];
  const url = `https://jsearch.p.rapidapi.com/search-v2?query=${encodeURIComponent(query)}&country=in&date_posted=${datePosted}&num_pages=1`;
  const r = await getJson<{ data: { jobs: any[] } }>(url, { headers: { 'x-rapidapi-key': k, 'x-rapidapi-host': 'jsearch.p.rapidapi.com' } });
  return (r.data?.jobs ?? []).map(jsearchToRaw);
}

// JSearch reports pay per period without a currency; normalise to annual, INR for Indian postings.
function annual(v: number | null | undefined, period?: string) {
  if (!v) return undefined;
  return Math.round(period === 'MONTH' ? v * 12 : period === 'HOUR' ? v * 2080 : period === 'WEEK' ? v * 52 : v);
}

function jsearchToRaw(j: any): RawJob {
  const publisher = String(j.job_publisher ?? 'google').toLowerCase().replace(/\.com$|\.in$/, '').replace(/[^a-z0-9]+/g, '-');
  return {
    source: `jsearch:${publisher}`,
    company: j.employer_name,
    title: j.job_title,
    location: [j.job_city, j.job_state, j.job_country === 'IN' ? 'India' : j.job_country].filter(Boolean).join(', ') || (j.job_is_remote ? 'Remote' : undefined),
    remote: Boolean(j.job_is_remote),
    url: j.job_google_link ?? j.job_apply_link,
    applyUrl: j.job_apply_link,
    description: j.job_description,
    salaryMin: annual(j.job_min_salary, j.job_salary_period),
    salaryMax: annual(j.job_max_salary, j.job_salary_period),
    currency: j.job_min_salary ? (j.job_salary_currency ?? (j.job_country === 'IN' ? 'INR' : 'USD')) : undefined,
    postedAt: toIso(j.job_posted_at_datetime_utc ?? j.job_posted_at_timestamp),
  };
}

/** JSearch (RapidAPI / OpenWeb Ninja): Google for Jobs, which aggregates LinkedIn, Naukri, Wellfound, Instahyre, company sites… */
export async function fetchJSearch(cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  const k = key('JSEARCH_API_KEY');
  if (!k) { log('JSearch skipped: add JSEARCH_API_KEY to .env (RapidAPI, free tier 200 requests/month)'); return []; }
  const jobs: RawJob[] = [];
  for (const { q, where } of searches(cfg, cfg.sources.apis.jsearchPerRun)) {
    if (!spendJsearch(cfg, log)) break;
    const url = `https://jsearch.p.rapidapi.com/search-v2?query=${encodeURIComponent(`${q} in ${where}`)}&country=in&date_posted=3days&num_pages=1${cfg.remote.only ? '&remote_jobs_only=true&work_from_home=true' : ''}`;
    try {
      const r = await getJson<{ data: { jobs: any[] } }>(url, { headers: { 'x-rapidapi-key': k, 'x-rapidapi-host': 'jsearch.p.rapidapi.com' } });
      jobs.push(...(r.data?.jobs ?? []).map(jsearchToRaw));
    } catch (e: any) {
      log(`JSearch "${q} in ${where}" failed: ${e.message}`);
      if (/429|403/.test(e.message)) break; // quota exhausted: stop burning calls
    }
  }
  const by = jobs.reduce<Record<string, number>>((m, j) => ((m[j.source] = (m[j.source] ?? 0) + 1), m), {});
  log(`JSearch → ${jobs.length} postings ${JSON.stringify(by)}`);
  return jobs;
}

/** Adzuna India: free key, aggregates Indian boards and company sites; often has salary. */
export async function fetchAdzuna(cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  const id = key('ADZUNA_APP_ID'), k = key('ADZUNA_APP_KEY');
  if (!id || !k) { log('Adzuna skipped: add ADZUNA_APP_ID and ADZUNA_APP_KEY to .env (developer.adzuna.com, free)'); return []; }
  const jobs: RawJob[] = [];
  for (const { q, where } of searches(cfg, cfg.sources.apis.adzunaPerRun)) {
    const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${id}&app_key=${k}&results_per_page=50&max_days_old=${cfg.maxAgeDays}` +
      `&what=${encodeURIComponent(q)}&where=${encodeURIComponent(where)}&content-type=application/json`;
    try {
      const r = await getJson<{ results: any[] }>(url);
      for (const j of r.results ?? []) {
        jobs.push({
          source: 'adzuna',
          company: j.company?.display_name ?? 'Unknown',
          title: htmlToText(j.title),
          location: j.location?.display_name,
          remote: isRemote(j.title) || isRemote(j.location?.display_name),
          url: j.redirect_url,
          applyUrl: j.redirect_url,
          description: htmlToText(j.description),
          salaryMin: j.salary_is_predicted === '1' ? undefined : j.salary_min,
          salaryMax: j.salary_is_predicted === '1' ? undefined : j.salary_max,
          currency: j.salary_min ? 'INR' : undefined,
          postedAt: toIso(j.created),
        });
      }
    } catch (e: any) { log(`Adzuna "${q} in ${where}" failed: ${e.message}`); }
  }
  log(`Adzuna → ${jobs.length} postings`);
  return jobs;
}

/** Jooble: free key, a large aggregator with strong Indian coverage (snippets only; full JD fetched at tailoring). */
export async function fetchJooble(cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  const k = key('JOOBLE_API_KEY');
  if (!k) { log('Jooble skipped: add JOOBLE_API_KEY to .env (jooble.org/api/about, free)'); return []; }
  const jobs: RawJob[] = [];
  for (const { q, where } of searches(cfg, cfg.sources.apis.jooblePerRun)) {
    try {
      const r = await getJson<{ jobs: any[] }>(`https://jooble.org/api/${k}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keywords: q, location: where === 'India' ? '' : where, page: '1', ResultOnPage: '50', datecreatedfrom: new Date(Date.now() - cfg.maxAgeDays * 86_400_000).toISOString().slice(0, 10) }),
      });
      for (const j of r.jobs ?? []) {
        jobs.push({
          source: 'jooble',
          company: j.company || 'Unknown',
          title: htmlToText(j.title),
          location: j.location,
          remote: isRemote(j.location) || isRemote(j.type),
          url: j.link,
          applyUrl: j.link,
          description: htmlToText(j.snippet),
          postedAt: toIso(j.updated),
        });
      }
    } catch (e: any) { log(`Jooble "${q} in ${where}" failed: ${e.message}`); }
  }
  log(`Jooble → ${jobs.length} postings`);
  return jobs;
}
