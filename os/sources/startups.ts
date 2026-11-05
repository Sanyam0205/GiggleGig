// Startup and remote-first boards. No keys: public JSON feeds, RSS, or the listing data embedded in public pages.
// Each returns a location string the ingest gate can judge ("Remote, India", "Worldwide", "Remote, Europe").
import type { SearchConfig } from '../config.ts';
import { htmlToText, toIso, type Log, type RawJob } from './types.ts';

const BROWSER = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', accept: 'text/html,application/json,application/rss+xml' };
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function page(url: string): Promise<string> {
  const res = await fetch(url, { headers: BROWSER, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ← ${url}`);
  return res.text();
}

function nextData(html: string): any {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('page has no embedded listing data (blocked or changed)');
  return JSON.parse(m[1]);
}

/** Run one page per item, gently, keeping whatever worked and saying what did not. */
async function eachPage<T>(name: string, items: T[], log: Log, fn: (item: T) => Promise<RawJob[]>): Promise<RawJob[]> {
  const jobs: RawJob[] = [];
  const failures: string[] = [];
  for (const item of items) {
    try { jobs.push(...await fn(item)); } catch (e: any) { failures.push(`${item}: ${e.message}`); }
    await pause(1200);
  }
  log(`${name} → ${jobs.length} postings${failures.length ? ` (${failures.length} of ${items.length} pages failed: ${failures[0]})` : ''}`);
  return jobs;
}

/** "₹6L – ₹12L • 0.1%" or "$40k – $100k" → yearly range. */
export function parsePay(text?: string): Pick<RawJob, 'salaryMin' | 'salaryMax' | 'currency'> {
  const m = /([₹$€£])\s*([\d.]+)\s*([kKlLmM])?\s*[–-]\s*[₹$€£]?\s*([\d.]+)\s*([kKlLmM])?/.exec(text ?? '');
  if (!m) return {};
  const unit = (n: string, u?: string) => Number(n) * ({ k: 1e3, l: 1e5, m: 1e6 }[(u ?? '').toLowerCase()] ?? 1);
  return { salaryMin: unit(m[2], m[3] ?? m[5]), salaryMax: unit(m[4], m[5] ?? m[3]), currency: ({ '₹': 'INR', $: 'USD', '€': 'EUR', '£': 'GBP' } as Record<string, string>)[m[1]] };
}

const list = (v: any): string[] => (Array.isArray(v) ? v : Array.isArray(v?.json) ? v.json : []);

export async function fetchWellfound(cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  const b = cfg.sources.startups;
  const urls = b.wellfoundRoles.flatMap((role) => [
    `https://wellfound.com/role/l/${role}/${b.wellfoundLocation}`,
    `https://wellfound.com/role/r/${role}`,
  ]);
  const place = b.wellfoundLocation.replace(/^./, (c) => c.toUpperCase());
  return eachPage('Wellfound', urls, log, async (url) => {
    const state = nextData(await page(url)).props?.pageProps?.apolloState?.data;
    if (!state) throw new Error('no listing data');
    const fromPlacePage = url.includes('/role/l/');
    const jobs: RawJob[] = [];
    for (const v of Object.values<any>(state)) {
      if (v?.__typename !== 'StartupResult') continue;
      for (const ref of v.highlightedJobListings ?? []) {
        const j = state[ref.__ref];
        if (!j?.title) continue;
        const accepted = list(j.acceptedRemoteLocationNames);
        const based = list(j.locationNames);
        // Wellfound states where a remote hire may live. With no list, the page's location is the best evidence.
        const location = !j.remote ? based.join(', ') || place
          : accepted.length ? `Remote, ${accepted.join(', ')}`
            : fromPlacePage ? `Remote, ${place}`
              : based.length ? `Remote, ${based.join(', ')}` : 'Remote';
        const link = `https://wellfound.com/company/${v.slug}/jobs/${j.id}-${j.slug}`;
        jobs.push({
          source: 'wellfound', company: v.name, title: j.title, location, remote: Boolean(j.remote), url: link, applyUrl: link,
          description: [v.highConcept, j.compensation && `Compensation: ${j.compensation}`, j.yearsExperienceMin != null && `Minimum experience: ${j.yearsExperienceMin} years`, v.companySize && `Company size: ${String(v.companySize).replace(/^SIZE_/, '').replace('_', '-')}`, j.description].filter(Boolean).join('\n\n'),
          postedAt: toIso(j.liveStartAt),
          ...parsePay(j.compensation),
        });
      }
    }
    return jobs;
  });
}

export async function fetchHimalayas(cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  const b = cfg.sources.startups;
  return eachPage('Himalayas', cfg.queries, log, async (q) => {
    const d = JSON.parse(await page(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&country=${encodeURIComponent(b.remoteCountry)}&limit=20`));
    return (d.jobs ?? []).map((j: any): RawJob => {
      const where = list(j.locationRestrictions);
      return {
        source: 'himalayas', company: j.companyName, title: j.title, remote: true,
        location: !where.length ? 'Worldwide' : where.includes(b.remoteCountry) ? `Remote, ${b.remoteCountry}` : `Remote, ${where.slice(0, 4).join(', ')}`,
        url: j.applicationLink ?? j.guid, applyUrl: j.applicationLink ?? j.guid,
        description: htmlToText(j.description ?? j.excerpt),
        salaryMin: j.minSalary ?? undefined, salaryMax: j.maxSalary ?? undefined, currency: j.currency ?? undefined,
        postedAt: toIso(j.pubDate),
      };
    });
  });
}

export async function fetchRemoteRocketship(cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  const b = cfg.sources.startups;
  const urls = b.rocketshipRoles.flatMap((role) => [1, 2, 3].map((n) => `https://www.remoterocketship.com/country/${b.remoteCountry.toLowerCase().replace(/\s+/g, '-')}/jobs/${role}/?page=${n}`));
  return eachPage('RemoteRocketship', urls, log, async (url) => {
    const rows = nextData(await page(url)).props?.pageProps?.initialJobOpenings ?? [];
    return rows.filter((j: any) => !j.dateDeleted && j.locationType === 'remote').map((j: any): RawJob => ({
      source: 'remoterocketship', company: j.company?.name ?? 'Unknown', title: j.roleTitle, remote: true,
      location: `Remote, ${j.location ?? b.remoteCountry}`, url: j.url, applyUrl: j.url,
      description: [j.jobDescriptionSummary, list(j.techStack).length && `Tech stack: ${list(j.techStack).join(', ')}`, j.company?.foundedYear && `Founded: ${j.company.foundedYear}`].filter(Boolean).join('\n\n'),
      postedAt: toIso(j.created_at),
    }));
  });
}

const CDATA = (s = '') => s.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
const tag = (item: string, name: string) => CDATA(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item)?.[1] ?? '');

export async function fetchWeWorkRemotely(_cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  const feeds = ['remote-back-end-programming-jobs', 'remote-full-stack-programming-jobs', 'remote-programming-jobs'];
  return eachPage('We Work Remotely', feeds, log, async (feed) => {
    const xml = await page(`https://weworkremotely.com/categories/${feed}.rss`);
    return xml.split('<item>').slice(1).map((item): RawJob | null => {
      const [company, ...role] = htmlToText(tag(item, 'title')).split(':');
      if (!role.length) return null;
      const link = tag(item, 'link');
      return {
        source: 'weworkremotely', company: company.trim(), title: role.join(':').trim(), remote: true,
        location: tag(item, 'region') || tag(item, 'country') || 'Remote', url: link, applyUrl: link,
        description: htmlToText(tag(item, 'description')), postedAt: toIso(tag(item, 'pubDate')),
      };
    }).filter(Boolean) as RawJob[];
  });
}

export async function fetchInstahyre(cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  // The board mixes office and remote roles and has no working remote filter, so several pages are read and narrowed here.
  const urls = cfg.sources.startups.skills.flatMap((skill) => [0, 20, 40, 60, 80].map((offset) => `${skill}|${offset}`));
  return eachPage('Instahyre', urls, log, async (key) => {
    const [skill, offset] = key.split('|');
    const d = JSON.parse(await page(`https://www.instahyre.com/api/v1/job_search?skills=${encodeURIComponent(skill)}&isLandingPage=true&limit=20&offset=${offset}`));
    return (d.objects ?? []).map((j: any): RawJob => ({
      source: 'instahyre', company: j.employer?.company_name ?? 'Unknown', title: j.candidate_title ?? j.title,
      location: j.locations, remote: /work from home|remote/i.test(j.locations ?? ''), url: j.public_url, applyUrl: j.public_url,
      description: [j.employer?.company_tagline, j.employer?.instahyre_note, list(j.keywords).length && `Skills: ${list(j.keywords).join(', ')}`, j.employer?.employee_count && `Employees: ${j.employer.employee_count}`].filter(Boolean).join('\n\n'),
    }));
  });
}

export async function fetchCutshort(cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  return eachPage('Cutshort', cfg.sources.startups.skills, log, async (skill) => {
    const queries = nextData(await page(`https://cutshort.io/jobs/remote-${encodeURIComponent(skill)}-jobs`)).props?.pageProps?.dehydratedState?.queries ?? [];
    const rows = queries.map((q: any) => q.state?.data?.data?.pageData).find((p: any) => p?.jobs)?.jobs ?? [];
    return rows.map((j: any): RawJob => ({
      source: 'cutshort', company: j.companyId?.name ?? j.companyDetails?.name ?? 'Unknown', title: j.headline,
      location: j.remoteType && j.remoteType !== 'remote_not_okay' ? `Remote, ${j.locationsText || 'India'}` : j.locationsText,
      remote: Boolean(j.remoteType && j.remoteType !== 'remote_not_okay'), url: j.publicUrl, applyUrl: j.publicUrl,
      description: [j.hiringForClient && 'Posted by a recruiter for a client.', j.jobFactSummary?.experience && `Experience: ${j.jobFactSummary.experience}`, j.salaryRangeText && `Salary: ${j.salaryRangeText}`, list(j.allSkills).length && `Skills: ${list(j.allSkills).join(', ')}`, htmlToText(j.sanitizedComment)].filter(Boolean).join('\n\n'),
      salaryMin: j.salaryRange?.min, salaryMax: j.salaryRange?.max, currency: j.salaryRange?.currency,
    }));
  });
}

export async function fetchYCombinator(cfg: SearchConfig, log: Log): Promise<RawJob[]> {
  const b = cfg.sources.startups;
  const urls = [`https://www.ycombinator.com/jobs/location/${b.wellfoundLocation}`, 'https://www.ycombinator.com/jobs/role/software-engineer/remote', 'https://www.ycombinator.com/jobs/role/backend/remote', 'https://www.ycombinator.com/jobs/role/full-stack/remote'];
  return eachPage('Y Combinator', urls, log, async (url) => {
    const m = /data-page="([^"]+)"/.exec(await page(url));
    if (!m) throw new Error('page has no embedded listing data');
    const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')).props?.jobPostings ?? [];
    return rows.filter((j: any) => j.role === 'eng').map((j: any): RawJob => {
      const link = `https://www.ycombinator.com${j.url}`;
      // YC abbreviates countries: "US / IN / SG / Remote", "Remote (IN)".
      const location = String(j.location ?? '').replace(/\bIN\b/g, 'India');
      return {
        source: 'ycombinator', company: j.companyName, title: j.title, location, remote: /remote/i.test(location), url: link, applyUrl: link,
        description: [j.companyOneLiner, j.minExperience && `Minimum experience: ${j.minExperience}`, j.salaryRange && `Salary: ${j.salaryRange}`, j.visa && `Visa: ${j.visa}`, list(j.skills).length && `Skills: ${list(j.skills).join(', ')}`].filter(Boolean).join('\n\n'),
      };
    });
  });
}

export const STARTUP_BOARDS: Record<string, (cfg: SearchConfig, log: Log) => Promise<RawJob[]>> = {
  wellfound: fetchWellfound, ycombinator: fetchYCombinator, cutshort: fetchCutshort, instahyre: fetchInstahyre,
  himalayas: fetchHimalayas, remoterocketship: fetchRemoteRocketship, weworkremotely: fetchWeWorkRemotely,
};
