import { useEffect, useRef, useState, useCallback } from 'react';

export interface QueueItem {
  id: number; kind: string; job_id: string | null; contact_id: number | null; title: string;
  body: any; status: string; due_at: string | null; created_at: string; decided_at: string | null;
  company?: string; job_title?: string; fit_score?: number | null;
}
export interface JobRow {
  id: string; company: string; title: string; location: string | null; remote: number; status: string;
  fit_score: number | null; source: string; sources: string; first_seen: string; updated_at: string; apply_url: string | null;
}
export interface MatchRow extends JobRow {
  verdict: string | null; rationale: string | null; salary_min: number | null; salary_max: number | null; currency: string | null;
  salaryEst: { min?: number; max?: number; currency?: string; estimated?: boolean } | null;
  warm?: number;
  eligibility?: { criterion: string; status: 'met' | 'unmet' | 'unknown'; importance?: string }[] | null;
  score5?: number | null; decision?: string | null; confidence?: string | null; legitimacy?: string | null;
  archetype?: string | null; report_num?: string | null; engine_status?: string | null;
  triage?: { verdict: string; score: number; reason: string; evalFailed?: number; blocked?: string } | null;
  advertisedComp?: string | null; hardStops?: string[]; nextAction?: string | null;
  evidence?: string | null;
  dimensions?: Record<string, number> | null;
}
export interface Contact { id: number; company: string; name: string; role: string | null; linkedin: string | null; email: string | null; relationship: string; last_contact_at: string | null; notes: string | null }
export interface CompanyRow { company: string; n: number; feasible: number; best: number | null; matched: number; seen: string; warm: number; tier: number | null; board: string | null }
export interface CompanyDetail {
  name: string; jobs: MatchRow[]; filtered: number; filteredReasons: { reason: string; n: number }[];
  target: { name: string; tier?: number; ats?: string; slug?: string; careersUrl?: string } | null;
  research: string | null; warmPaths: Contact[]; lastSearch: { id: number; status: string; started_at: string; ended_at: string | null; summary: string | null } | null;
}
export interface AlertsInfo {
  enabled: boolean; minFit: number; server: string; topic: string;
  fastlane: { enabled: boolean; everyMinutes: number; tier: number; hoursOld: number };
  inbox: { enabled: boolean; lookbackHours: number };
}
export interface Platform {
  key: string; group: string; name: string; prefix: string; how: string; enabled: boolean;
  found: number; passed: number; scored: number; matched: number; lastSeen: string | null;
}
export interface SourcesReport {
  platforms: Platform[];
  groups: Record<string, any>;
  lastScout: { id: number; started_at: string; ended_at: string | null; status: string; log: string[] } | null;
  agentRuns: { agent: string; status: string; started_at: string; error: string | null }[];
  automation: { tailor: 'auto' | 'manual'; autoTailorMin: number };
  thresholds: { skip: number; apply: number };
  running: string[];
}
export interface Run {
  id: number; agent: string; job_id: string | null; status: string; model: string | null; started_at: string;
  ended_at: string | null; duration_ms: number | null; cost_usd: number | null; summary: string | null; error: string | null;
  company?: string | null;
}
export interface RunEvent { id: number; run_id: number; ts: string; type: string; text: string; agent?: string }
export interface Today {
  queue: QueueItem[];
  scheduled: { id: number; kind: string; title: string; due_at: string }[];
  interviews: any[];
  newMatches: (JobRow & { first_seen: string })[];
  recent: MatchRow[];
  stages: { status: string; n: number }[];
  running: { id: number; agent: string; job_id: string | null; started_at: string }[];
  lastBriefing: { started_at: string; ended_at: string | null; status: string; summary: string } | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export const api = {
  today: () => req<Today>('/api/today'),
  jobs: (params: { status?: string; q?: string } = {}) =>
    req<JobRow[]>(`/api/jobs?${new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])}`),
  job: (id: string) => req<any>(`/api/jobs/${id}`),
  setStatus: (id: string, status: string, note?: string) =>
    req(`/api/jobs/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) }),
  evaluate: (id: string, answer?: string) => req(`/api/jobs/${id}/evaluate`, { method: 'POST', body: JSON.stringify({ answer }) }),
  engine: () => req<any>('/api/engine'),
  engineAction: (a: 'update-check' | 'update' | 'verify') => req<{ code: number; result: any }>(`/api/engine/${a}`, { method: 'POST' }),
  tailor: (id: string, notes?: string) => req(`/api/jobs/${id}/tailor`, { method: 'POST', body: JSON.stringify({ notes }) }),
  kit: (id: string) => req(`/api/jobs/${id}/kit`, { method: 'POST' }),
  referral: (id: string, contactId: number) => req(`/api/jobs/${id}/referral`, { method: 'POST', body: JSON.stringify({ contactId }) }),
  companySearch: (name: string) => req<{ started?: string; already?: boolean; name: string }>('/api/company-search', { method: 'POST', body: JSON.stringify({ name }) }),
  companyResearch: (name: string) => req('/api/companies/research', { method: 'POST', body: JSON.stringify({ name }) }),
  companies: (q = '') => req<CompanyRow[]>(`/api/companies?q=${encodeURIComponent(q)}`),
  company: (name: string) => req<CompanyDetail>(`/api/companies/${encodeURIComponent(name)}`),
  importContacts: (csv: string) => req<{ added: number; updated: number; total: number }>('/api/contacts/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  alerts: () => req<AlertsInfo>('/api/alerts'),
  testAlert: () => req<{ ok: boolean }>('/api/alerts/test', { method: 'POST' }),
  evaluateMany: (ids: string[]) => req('/api/evaluate', { method: 'POST', body: JSON.stringify({ ids }) }),
  limits: () => req<any>('/api/limits'),
  tailorMany: (ids: string[]) => req(`/api/tailor`, { method: 'POST', body: JSON.stringify({ ids }) }),
  matches: (params: { minFit?: number; platform?: string; q?: string; status?: string }) =>
    req<MatchRow[]>(`/api/jobs?${new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]))}`),
  sources: () => req<SourcesReport>('/api/sources'),
  settings: (patch: object) => req<any>('/api/settings', { method: 'POST', body: JSON.stringify(patch) }),
  uploadResume: async (file: File) => {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the selected resume.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.readAsDataURL(file);
    });
    return req<{ started?: string; already?: boolean }>('/api/onboarding/resume', {
      method: 'POST', body: JSON.stringify({ filename: file.name, data, replaceCandidate: true }),
    });
  },
  scoutOne: (key: string) => req(`/api/run/scout/${key}`, { method: 'POST' }),
  queueItem: (id: number) => req<any>(`/api/queue/${id}`),
  editQueue: (id: number, edits: object) => req(`/api/queue/${id}/edit`, { method: 'POST', body: JSON.stringify({ edits }) }),
  decide: (id: number, action: 'approve' | 'reject' | 'done', edits?: object) =>
    req<{ status: string }>(`/api/queue/${id}/${action}`, { method: 'POST', body: JSON.stringify({ edits }) }),
  stop: (runId: number) => req<{ stopped: number }>(`/api/runs/${runId}/stop`, { method: 'POST' }),
  stopAll: () => req<{ stopped: number }>('/api/stop', { method: 'POST' }),
  runs: (limit = 100) => req<Run[]>(`/api/runs?limit=${limit}`),
  run: (id: number) => req<Run & { events: RunEvent[] }>(`/api/runs/${id}`),
  start: (pipeline: 'briefing' | 'scout' | 'score' | 'triage' | 'tailor' | 'fastlane' | 'inbox') => req(`/api/run/${pipeline}`, { method: 'POST' }),
  contacts: () => req<any[]>('/api/contacts'),
  interviews: () => req<{ upcoming: any[]; weakSpots: { type: string; avg: number; answers: number }[] }>('/api/interviews'),
  candidate: () => req<{ state: 'none' | 'intake' | 'failed' | 'ready'; at: string; error?: string }>('/api/candidate'),
  config: () => req<{ search: any; lanUrl: string | null; profile: { name: string; target: string } }>('/api/config'),
};

export interface StreamMsg { events?: RunEvent[]; runs?: Run[]; queueChanged?: boolean; jobsChanged?: boolean }

/** One EventSource for the whole app; components subscribe to what they need. */
const listeners = new Set<(m: StreamMsg) => void>();
let source: EventSource | null = null;
function ensureStream() {
  if (source) return;
  source = new EventSource('/api/stream');
  source.onmessage = (e) => {
    const msg = JSON.parse(e.data) as StreamMsg;
    for (const l of listeners) l(msg);
  };
}
export function useStream(fn: (m: StreamMsg) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ensureStream();
    const l = (m: StreamMsg) => ref.current(m);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
}

/** Fetch + refetch when the stream says the underlying data changed. */
export function useLive<T>(load: () => Promise<T>, deps: unknown[], on: (m: StreamMsg) => boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => load().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), deps);
  useEffect(() => { refresh(); }, [refresh]);
  useStream((m) => { if (on(m)) refresh(); });
  return { data, error, refresh };
}

export const parseSqlTime = (s: string) => new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));

export function ago(s: string | null | undefined) {
  if (!s) return '';
  const sec = Math.round((Date.now() - parseSqlTime(s).getTime()) / 1000);
  if (sec < 0) {
    const f = -sec;
    return f < 3600 ? `in ${Math.round(f / 60)}m` : f < 86400 ? `in ${Math.round(f / 3600)}h` : `in ${Math.round(f / 86400)}d`;
  }
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

/** ₹12–16 LPA for INR, $90k–120k for USD; null when nothing is known. */
export function formatPay(min?: number | null, max?: number | null, currency?: string | null) {
  if (!min && !max) return null;
  const cur = (currency ?? 'INR').toUpperCase();
  if (cur === 'INR') {
    const lpa = (v?: number | null) => (v ? (v >= 100000 ? +(v / 100000).toFixed(1) : v) : null);
    const [a, b] = [lpa(min), lpa(max)];
    return `₹${a ?? '?'}${b && b !== a ? `–${b}` : ''} LPA`;
  }
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : `${cur} `;
  const k = (v?: number | null) => (v ? (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)) : '?');
  return `${sym}${k(min)}${max && max !== min ? `–${k(max)}` : ''}`;
}

export function duration(ms: number | null) {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
