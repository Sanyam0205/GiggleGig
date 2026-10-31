// Public job-board APIs for the ATSs most tech companies use. No auth, no scraping.
import type { TargetCompany } from '../config.ts';
import { getJson, htmlToText, isRemote, toIso, type Log, type RawJob } from './types.ts';

async function greenhouse(c: TargetCompany): Promise<RawJob[]> {
  const r = await getJson<{ jobs: any[] }>(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`);
  return r.jobs.map((j) => ({
    source: 'greenhouse',
    company: c.name,
    title: j.title,
    location: j.location?.name,
    remote: isRemote(j.location?.name),
    url: j.absolute_url,
    applyUrl: j.absolute_url,
    description: htmlToText(j.content),
    postedAt: toIso(j.first_published ?? j.updated_at),
  }));
}

async function lever(c: TargetCompany): Promise<RawJob[]> {
  const r = await getJson<any[]>(`https://api.lever.co/v0/postings/${c.slug}?mode=json`);
  return r.map((j) => ({
    source: 'lever',
    company: c.name,
    title: j.text,
    location: j.categories?.location ?? j.categories?.allLocations?.join(', '),
    remote: j.workplaceType === 'remote' || isRemote(j.categories?.location),
    url: j.hostedUrl,
    applyUrl: j.applyUrl,
    description: [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain]
      .filter(Boolean).join('\n\n'),
    salaryMin: j.salaryRange?.min,
    salaryMax: j.salaryRange?.max,
    currency: j.salaryRange?.currency,
    postedAt: toIso(j.createdAt),
  }));
}

async function ashby(c: TargetCompany): Promise<RawJob[]> {
  const r = await getJson<{ jobs: any[] }>(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=true`);
  return r.jobs.filter((j) => j.isListed !== false).map((j) => {
    const comp = j.compensation?.summaryComponents?.find((s: any) => s.compensationType === 'Salary');
    return {
      source: 'ashby',
      company: c.name,
      title: j.title,
      location: [j.location, ...(j.secondaryLocations ?? []).map((l: any) => l.location)].filter(Boolean).join(' · '),
      remote: Boolean(j.isRemote) || isRemote(j.location),
      url: j.jobUrl,
      applyUrl: j.applyUrl,
      description: j.descriptionPlain ?? htmlToText(j.descriptionHtml),
      salaryMin: comp?.minValue,
      salaryMax: comp?.maxValue,
      currency: comp?.currencyCode,
      postedAt: toIso(j.publishedAt),
    };
  });
}

async function workable(c: TargetCompany): Promise<RawJob[]> {
  const r = await getJson<{ jobs: any[] }>(`https://apply.workable.com/api/v1/widget/accounts/${c.slug}?details=true`);
  return r.jobs.map((j) => ({
    source: 'workable',
    company: c.name,
    title: j.title,
    location: [j.city, j.state, j.country].filter(Boolean).join(', '),
    remote: Boolean(j.telecommuting),
    url: j.url,
    applyUrl: j.application_url ?? j.url,
    description: htmlToText(j.description),
    postedAt: toIso(j.published_on ?? j.created_at),
  }));
}

async function smartrecruiters(c: TargetCompany): Promise<RawJob[]> {
  const r = await getJson<{ content: any[] }>(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100`);
  return r.content.map((j) => ({
    source: 'smartrecruiters',
    company: c.name,
    title: j.name,
    location: [j.location?.city, j.location?.country].filter(Boolean).join(', '),
    remote: Boolean(j.location?.remote),
    url: `https://jobs.smartrecruiters.com/${c.slug}/${j.id}`,
    applyUrl: `https://jobs.smartrecruiters.com/${c.slug}/${j.id}`,
    postedAt: toIso(j.releasedDate),
  }));
}

export const ADAPTERS = { greenhouse, lever, ashby, workable, smartrecruiters };

/** Finds which public ATS board a company uses by trying the usual slug spellings. */
export async function discoverBoard(name: string): Promise<{ ats: keyof typeof ADAPTERS; slug: string; jobs: RawJob[] } | null> {
  const base = name.toLowerCase().replace(/\b(inc|ltd|pvt|private|limited|technologies|labs|india)\b/g, '').trim();
  const slugs = [...new Set([base.replace(/[^a-z0-9]/g, ''), base.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''), base.split(/\s+/)[0]])].filter(Boolean);
  for (const slug of slugs) {
    for (const ats of Object.keys(ADAPTERS) as (keyof typeof ADAPTERS)[]) {
      try {
        const jobs = await ADAPTERS[ats]({ name, slug, ats });
        if (jobs.length) return { ats, slug, jobs };
      } catch { /* not this one */ }
    }
  }
  return null;
}

export async function fetchAts(companies: TargetCompany[], log: Log): Promise<RawJob[]> {
  const boards = companies.filter((c) => c.ats && c.slug);
  const results = await Promise.allSettled(boards.map((c) => ADAPTERS[c.ats!](c)));
  const jobs: RawJob[] = [];
  results.forEach((r, i) => {
    const c = boards[i];
    if (r.status === 'fulfilled') {
      jobs.push(...r.value);
    } else {
      log(`${c.name} (${c.ats}/${c.slug}) failed: ${r.reason?.message ?? r.reason}`);
    }
  });
  log(`ATS boards: ${boards.length} companies → ${jobs.length} postings`);
  return jobs;
}
