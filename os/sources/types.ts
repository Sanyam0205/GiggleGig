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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
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

export function toIso(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
