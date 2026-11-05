// Sources with no API: job-alert emails (Wellfound, Weekday, LinkedIn, Otta, ...) and open web search.
import { GMAIL_READ, runAgent } from '../agent.ts';
import type { SearchConfig, TargetCompany } from '../config.ts';
import { toIso, type Log, type RawJob } from './types.ts';

export const JOBS_SCHEMA = {
  type: 'object',
  properties: {
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          title: { type: 'string' },
          location: { type: 'string' },
          remote: { type: 'boolean' },
          url: { type: 'string', description: 'Best link to the posting; prefer the company ATS page over an aggregator.' },
          description: { type: 'string', description: 'Whatever JD text is available, verbatim. Empty if none.' },
          salaryMin: { type: 'number' },
          salaryMax: { type: 'number' },
          postedAt: { type: 'string' },
          via: { type: 'string', description: 'Where it was found, e.g. wellfound, weekday, linkedin-alert, web' },
        },
        required: ['company', 'title', 'url', 'via'],
      },
    },
    careersUrl: { type: 'string', description: "The company's own careers page (company search only)." },
    newBoards: {
      type: 'array',
      description: 'Company job boards discovered on Greenhouse/Lever/Ashby/Workable, so they can be polled directly next time.',
      items: {
        type: 'object',
        properties: { company: { type: 'string' }, ats: { type: 'string' }, slug: { type: 'string' } },
        required: ['company', 'ats', 'slug'],
      },
    },
  },
  required: ['jobs'],
};

export type Found = { jobs: (RawJob & { via: string })[]; careersUrl?: string; newBoards?: { company: string; ats: string; slug: string }[] };

function normalize(found: Found | undefined, prefix: string): RawJob[] {
  return (found?.jobs ?? []).map((j) => ({
    ...j,
    source: `${prefix}:${j.via || 'unknown'}`,
    applyUrl: j.url,
    postedAt: toIso(j.postedAt),
  }));
}

export async function fetchGmailAlerts(cfg: SearchConfig, log: Log): Promise<{ jobs: RawJob[]; boards: Found['newBoards'] }> {
  const days = cfg.sources.gmailAlerts.lookbackDays;
  const r = await runAgent<Found>({
    agent: 'scout:gmail',
    tools: [...GMAIL_READ, 'WebFetch'],
    maxTurns: 30,
    timeoutMs: 5 * 60_000,
    schema: JOBS_SCHEMA,
    prompt: `You are the inbox scout for a job search. Search Gmail for job-alert and recruiter emails from the last ${days} days.

Run these searches (Gmail query syntax):
- newer_than:${days}d (from:wellfound.com OR from:angel.co OR from:weekday.works OR from:jobalerts-noreply@linkedin.com OR from:jobs-noreply@linkedin.com OR from:naukri.com OR from:instahyre.com OR from:cutshort.io OR from:hirist.tech OR from:foundit.in OR from:otta.com OR from:welcometothejungle.com OR from:indeed.com OR from:glassdoor.com OR from:ycombinator.com OR from:hired.com)
- newer_than:${days}d subject:(job OR role OR opportunity OR hiring OR position) -from:me

From each email extract every individual job: company, title, location, remote flag, the job link, and any salary.
Also capture recruiters reaching out about a specific role (via: "recruiter").
Only keep software engineering roles matching: ${cfg.queries.join(', ')}.
If a link is a tracking redirect, keep it as-is; do not fetch more than 10 links.
If a posting links to boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com or apply.workable.com, add the board to newBoards.
Do not modify, label, archive or send any email.`,
  });
  const jobs = normalize(r.data, 'gmail');
  log(r.ok ? `Gmail alerts → ${jobs.length} postings` : `Gmail scout failed: ${r.error}`);
  return { jobs, boards: r.data?.newBoards };
}

export async function fetchWebSearch(cfg: SearchConfig, targets: TargetCompany[], log: Log): Promise<{ jobs: RawJob[]; boards: Found['newBoards'] }> {
  const known = targets.filter((t) => t.slug).map((t) => t.name).join(', ') || 'none yet';
  const r = await runAgent<Found>({
    agent: 'scout:web',
    tools: ['WebSearch', 'WebFetch'],
    maxTurns: 40,
    timeoutMs: 8 * 60_000,
    schema: JOBS_SCHEMA,
    prompt: `You are the open-web scout for a software engineering job search. Find postings published in the last ${cfg.maxAgeDays} days that the API scouts would miss.

Target roles: ${cfg.queries.join(', ')}. Locations: ${cfg.locations.join(', ')}, or remote roles open to candidates there.
${cfg.remote.only ? `Only remote roles a candidate living in ${cfg.locations[0] ?? 'their country'} can take; prefer startups. Skip office, hybrid and region-locked roles.\n` : ''}Use at most ${cfg.sources.webSearch.maxQueries} searches, e.g.:
- site:jobs.ashbyhq.com OR site:jobs.lever.co OR site:boards.greenhouse.io "<role>" "<location>"
- site:wellfound.com/jobs "<role>"
- "<role>" "series A" OR "series B" hiring ${new Date().getFullYear()}
Skip companies whose boards are already polled directly: ${known}.

For each concrete posting return company, title, location, url and via:"web". Put any newly found ATS boards (company + ats + slug from the URL) in newBoards.
Never invent postings; every url must come from a search result or fetched page.`,
  });
  const jobs = normalize(r.data, 'web');
  log(r.ok ? `Web scout → ${jobs.length} postings, ${r.data?.newBoards?.length ?? 0} new boards` : `Web scout failed: ${r.error}`);
  return { jobs, boards: r.data?.newBoards };
}
