export interface RawJob {
  source: string;
  company: string;
  title: string;
  location?: string;
  remote?: boolean;
  url?: string;
  applyUrl?: string;
  description?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  postedAt?: string; // ISO
}

export type Log = (line: string) => void;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function htmlToText(html = ''): string {
  return html
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e) => ENTITIES[e])
    .replace(/<(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'user-agent': 'job-search-os/1.0 (personal job search)', accept: 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ← ${url}`);
  return res.json() as Promise<T>;
}

export const isRemote = (s = '') => /remote|anywhere|distributed/i.test(s);

// Hosts that never carry a job posting: a link here is a video, a profile, a post or a redirect, not something to apply to.
const NOT_JOB_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com|github\.com|gitlab\.com|medium\.com|substack\.com|bit\.ly|t\.co|tinyurl\.com|lnkd\.in|instagram\.com|facebook\.com|tiktok\.com|reddit\.com|discord\.gg|discord\.com|calendly\.com|loom\.com|imgur\.com|wikipedia\.org|apple\.com\/podcasts|spotify\.com)$/i;

/** True when a URL can be a job posting or an application page. */
export function isJobLink(u?: string | null): boolean {
  if (!u) return false;
  let x: URL;
  try { x = new URL(u); } catch { return false; }
  if (!/^https?:$/.test(x.protocol)) return false;
  const host = x.hostname.toLowerCase();
  if (NOT_JOB_HOSTS.test(host)) return false;
  // LinkedIn hosts posts and profiles too; only its job pages count.
  if (host.endsWith('linkedin.com') && !/\/jobs\//.test(x.pathname) && !x.searchParams.has('currentJobId')) return false;
  return true;
}

export function toIso(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
