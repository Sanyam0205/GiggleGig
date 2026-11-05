// Open job feeds: RemoteOK, Remotive, and the monthly HN "Who is hiring?" thread.
import { getJson, htmlToText, isJobLink, toIso, type Log, type RawJob } from './types.ts';

export async function fetchRemoteOk(log: Log): Promise<RawJob[]> {
  const rows = await getJson<any[]>('https://remoteok.com/api');
  const jobs = rows.filter((r) => r.id && r.position).map((j) => ({
    source: 'remoteok',
    company: j.company,
    title: j.position,
    location: j.location || 'Remote',
    remote: true,
    url: j.url,
    applyUrl: j.apply_url || j.url,
    description: htmlToText(j.description),
    salaryMin: j.salary_min || undefined,
    salaryMax: j.salary_max || undefined,
    currency: j.salary_min ? 'USD' : undefined,
    postedAt: toIso(j.date),
  }));
  log(`RemoteOK → ${jobs.length} postings`);
  return jobs;
}

export async function fetchRemotive(log: Log): Promise<RawJob[]> {
  const r = await getJson<{ jobs: any[] }>('https://remotive.com/api/remote-jobs?category=software-dev');
  const jobs = r.jobs.map((j) => ({
    source: 'remotive',
    company: j.company_name,
    title: j.title,
    location: j.candidate_required_location || 'Remote',
    remote: true,
    url: j.url,
    applyUrl: j.url,
    description: htmlToText(j.description),
    postedAt: toIso(j.publication_date),
  }));
  log(`Remotive → ${jobs.length} postings`);
  return jobs;
}

/** HN posts are free-form; the first line is conventionally "Company | Role | Location | ...". */
export async function fetchHackerNews(log: Log): Promise<RawJob[]> {
  const search = await getJson<{ hits: any[] }>(
    'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=%22who%20is%20hiring%22&hitsPerPage=1',
  );
  const story = search.hits[0];
  if (!story) return [];
  const item = await getJson<{ children: any[] }>(`https://hn.algolia.com/api/v1/items/${story.objectID}`);
  const jobs: RawJob[] = [];
  for (const c of item.children ?? []) {
    if (!c.text) continue;
    const text = htmlToText(c.text);
    const head = text.split('\n')[0];
    const parts = head.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const title = parts.find((p) => /engineer|developer|swe|sde|stack|backend|frontend/i.test(p)) ?? parts[1];
    // A comment links many things (demos, videos, the founder's GitHub); the apply link is the first one that can be a job page.
    const links = [...c.text.matchAll(/href="([^"]+)"/g)].map((m: RegExpMatchArray) => m[1].replace(/&#x2F;/g, '/').replace(/&amp;/g, '&'));
    const link = links.find((l) => isJobLink(l) && !/news\.ycombinator\.com/.test(l));
    jobs.push({
      source: 'hackernews',
      company: parts[0].replace(/\(.*?\)/g, '').trim(),
      title,
      location: parts.find((p) => p !== title && /remote|onsite|hybrid|india|bangalore|bengaluru|,|\b(SF|NYC|NY|London|Berlin)\b/i.test(p)),
      remote: /remote/i.test(head),
      url: `https://news.ycombinator.com/item?id=${c.id}`,
      applyUrl: link,
      description: text,
      postedAt: toIso(c.created_at),
    });
  }
  log(`HN "${story.title}" → ${jobs.length} postings`);
  return jobs;
}
