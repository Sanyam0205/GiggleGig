import { createHash } from 'node:crypto';
import { db } from '../db.ts';
import type { SearchConfig } from '../config.ts';
import type { RawJob } from '../sources/types.ts';

// When two sources report the same job, trust the one closest to the company.
const SOURCE_RANK = ['boards', 'greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'wellfound', 'ycombinator', 'cutshort', 'instahyre', 'himalayas', 'weworkremotely', 'remoterocketship', 'jsearch', 'jobspy', 'adzuna', 'jooble', 'remoteok', 'remotive', 'hackernews', 'gmail', 'web'];
const rank = (s: string) => {
  const i = SOURCE_RANK.indexOf(s.split(':')[0]);
  return i === -1 ? SOURCE_RANK.length : i;
};

export function normCompany(s: string) {
  return s.toLowerCase().replace(/[,.]|\b(inc|llc|ltd|corp|corporation|co|gmbh|technologies|hq)\b/g, '').replace(/\s+/g, ' ').trim();
}

function normTitle(s: string) {
  return s.toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\b(sr)\b\.?/g, 'senior').replace(/\b(jr)\b\.?/g, 'junior')
    .replace(/\s+[-–]\s+.*$/, '')         // team suffixes vary by source: "Backend Engineer - Payments"
    .replace(/[^a-z0-9+# ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function dedupeKey(j: RawJob) {
  return `${normCompany(j.company)}|${normTitle(j.title)}`;
}

const word = (w: string) => new RegExp(`\\b${w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i');

// Remote roles that are open to this candidate even when another region is also named.
const OPEN_REMOTE = /\b(global|worldwide|anywhere|apac|asia|international)\b/i;
const REMOTE_WORDS = /\b(remote|anywhere|worldwide|work from home|wfh)\b/i;
// Stricter wording for a job description, where a bare "remote" often means "remote teams" or "remote debugging".
const REMOTE_JD = /\b(fully remote|100% remote|remote[- ](role|position|job|first|only|work|opportunity)|work from home|wfh)\b/i;

/** A posted salary as yearly INR. INR figures under 2 lakh are taken as monthly. Other currencies: unknown. */
export function yearlyInr(v: number | undefined, currency: string | undefined, cfg: SearchConfig): number | null {
  if (!v) return null;
  const c = (currency || 'INR').toUpperCase();
  if (c === 'INR') return v < 200_000 ? v * 12 : v;
  if (c === 'USD') return v * (cfg.preferences?.usdToInr ?? 88);
  return null;
}

/** Cheap deterministic gate so the LLM only scores plausible roles. Returns a reason when filtered out. */
export function prefilter(j: RawJob, cfg: SearchConfig): string | null {
  const title = j.title;
  // An empty list is "not set for this candidate yet", not "nothing qualifies".
  if (cfg.titleInclude.length && !cfg.titleInclude.some((w) => word(w).test(title))) return 'title: no target keyword';
  const ex = cfg.titleExclude.find((w) => word(w).test(title));
  if (ex) return `title: excluded "${ex.trim()}"`;
  const floor = cfg.preferences?.minAnnualSalary;
  const top = floor ? yearlyInr(j.salaryMax, j.currency, cfg) : null;
  if (floor && top != null && top < floor) return `pay: top of range ₹${Math.round(top).toLocaleString('en-IN')} a year`;
  if (j.postedAt) {
    const ageDays = (Date.now() - Date.parse(j.postedAt)) / 86_400_000;
    if (ageDays > cfg.maxAgeDays) return `stale: ${Math.round(ageDays)}d old`;
  }
  const loc = j.location ?? '';
  const inPlace = cfg.locations.some((l) => word(l).test(loc));
  const remote = j.remote || REMOTE_WORDS.test(loc);
  // Remote-only search: an office role never reaches the AI. A posting with no location at all is left for triage to read.
  if (cfg.remote.only && loc && !remote && !REMOTE_WORDS.test(title) && !(inPlace && REMOTE_JD.test(j.description ?? ''))) return `not remote: ${loc}`;
  if (!loc || !cfg.locations.length) return null;
  if (inPlace) return null;
  if (remote && cfg.remote.accept) {
    if (OPEN_REMOTE.test(loc)) return null;
    // Bare "Remote" is open; "Remote, Poland" / "Remote - US" is tied to that region.
    const rest = loc.replace(/\b(remote|fully|100%|work from home|wfh|first|only|friendly)\b/gi, '').replace(/[^a-z]/gi, '');
    return rest ? `remote: ${loc}` : null;
  }
  return `location: ${loc}`;
}

export interface IngestStats { seen: number; inserted: number; merged: number; filtered: number }

export function ingest(jobs: RawJob[], cfg: SearchConfig): IngestStats {
  const stats: IngestStats = { seen: jobs.length, inserted: 0, merged: 0, filtered: 0 };
  const find = db.prepare('SELECT id, source, sources, description, apply_url, url, status FROM jobs WHERE dedupe_key = ?');
  const reopen = db.prepare(`UPDATE jobs SET status = 'sourced', filter_reason = NULL, location = ?, remote = ? WHERE id = ?`);
  const insert = db.prepare(`INSERT INTO jobs (id, dedupe_key, source, sources, company, title, location, remote, url, apply_url,
      description, salary_min, salary_max, currency, posted_at, status, filter_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const merge = db.prepare(`UPDATE jobs SET last_seen = datetime('now'), sources = ?, source = ?, url = ?, apply_url = ?,
      description = ?, salary_min = COALESCE(salary_min, ?), salary_max = COALESCE(salary_max, ?), currency = COALESCE(currency, ?),
      posted_at = COALESCE(posted_at, ?) WHERE id = ?`);

  db.exec('BEGIN');
  try {
    for (const j of jobs) {
      if (!j.company || !j.title) continue;
      const key = dedupeKey(j);
      const existing = find.get(key) as any;
      if (existing) {
        const sources = new Set<string>(JSON.parse(existing.sources));
        sources.add(j.source);
        const better = rank(j.source) < rank(existing.source);
        const desc = (j.description?.length ?? 0) > (existing.description?.length ?? 0) ? j.description : existing.description;
        merge.run(JSON.stringify([...sources]), better ? j.source : existing.source,
          better ? j.url ?? existing.url : existing.url ?? j.url ?? null,
          better ? j.applyUrl ?? existing.apply_url : existing.apply_url ?? j.applyUrl ?? null,
          desc ?? null, j.salaryMin ?? null, j.salaryMax ?? null, j.currency ?? null, j.postedAt ?? null, existing.id);
        // Same role, different city: a variant that passes the gate reopens a filtered row.
        if (existing.status === 'filtered' && !prefilter(j, cfg)) {
          reopen.run(j.location ?? null, j.remote ? 1 : 0, existing.id);
          stats.filtered--;
          stats.inserted++;
        }
        stats.merged++;
        continue;
      }
      const reason = prefilter(j, cfg);
      if (reason) stats.filtered++;
      else stats.inserted++;
      const id = createHash('sha1').update(key).digest('hex').slice(0, 12);
      insert.run(id, key, j.source, JSON.stringify([j.source]), j.company.trim(), j.title.trim(), j.location ?? null,
        j.remote ? 1 : 0, j.url ?? null, j.applyUrl ?? j.url ?? null, j.description ?? null,
        j.salaryMin ? Math.round(j.salaryMin) : null, j.salaryMax ? Math.round(j.salaryMax) : null, j.currency ?? null,
        j.postedAt ?? null, reason ? 'filtered' : 'sourced', reason);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return stats;
}
