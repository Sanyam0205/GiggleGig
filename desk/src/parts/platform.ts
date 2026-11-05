// Where a role was found, in words: "jobspy:linkedin" → "LinkedIn".
const NAMES: Record<string, string> = {
  linkedin: 'LinkedIn', naukri: 'Naukri', indeed: 'Indeed', glassdoor: 'Glassdoor', google: 'Google Jobs', zip_recruiter: 'ZipRecruiter',
  greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workable: 'Workable', smartrecruiters: 'SmartRecruiters', adzuna: 'Adzuna', jooble: 'Jooble',
  remoteok: 'RemoteOK', remotive: 'Remotive', hackernews: 'Hacker News', manual: 'You', wellfound: 'Wellfound', ycombinator: 'Y Combinator',
  cutshort: 'Cutshort', instahyre: 'Instahyre', himalayas: 'Himalayas', remoterocketship: 'RemoteRocketship', weworkremotely: 'We Work Remotely', boards: 'Company board',
};
const title = (s: string) => s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function platformName(src: string) {
  const [kind, site] = src.split(':');
  if (kind === 'jobspy') return NAMES[site] ?? site;
  if (kind === 'jsearch') return NAMES[site] ?? (site ? title(site) : 'Google Jobs');
  if (kind === 'gmail') return site?.startsWith('linkedin') ? 'LinkedIn alert' : `${title((site ?? 'email').replace(/-.*/, ''))} (email)`;
  if (kind === 'web') return 'Web search';
  if (kind === 'firecrawl') return site ? NAMES[site] ?? title(site) : 'Web crawl';
  return NAMES[kind] ?? kind;
}
