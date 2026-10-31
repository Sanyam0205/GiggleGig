import type { QueueItem } from '../api';

// Consignment numbers: JS-<kind code>-<job id head>-<queue id>, printed small and tabular on every slip.
const KIND_CODE: Record<string, string> = {
  application: 'AP', referral: 'RF', connection: 'CN', 'hiring-manager': 'HM', email: 'EM', 'thank-you': 'TY', followup: 'FU',
};

export const KIND_LABEL: Record<string, string> = {
  application: 'Application', referral: 'Referral ask', connection: 'Connection batch', 'hiring-manager': 'Hiring manager',
  email: 'Email', 'thank-you': 'Thank-you note', followup: 'Follow-up',
};

/** Rough minutes each kind of slip takes you, for the notice board's daily time budget. */
export const KIND_MINUTES: Record<string, number> = {
  application: 10, referral: 4, connection: 12, 'hiring-manager': 5, email: 3, 'thank-you': 3, followup: 2,
};

export function consignment(q: Pick<QueueItem, 'id' | 'kind' | 'job_id'>) {
  const head = (q.job_id ?? '0000').slice(0, 4).toUpperCase();
  return `JS-${KIND_CODE[q.kind] ?? 'XX'}-${head}-${String(q.id).padStart(4, '0')}`;
}

export type TrackStep = { label: string; at?: string | null; done: boolean };

/** Booked → Franked → Dispatched → Delivered, worded per channel. */
export function tracking(q: QueueItem, jobStatus?: string): TrackStep[] {
  const email = q.body?.channel === 'email';
  const franked = q.status === 'approved' || q.status === 'done';
  const dispatched = q.status === 'done';
  const delivered = q.kind === 'application'
    ? ['interviewing', 'offer', 'accepted', 'referred'].includes(jobStatus ?? '')
    : false;
  return [
    { label: 'Booked', at: q.created_at, done: true },
    { label: 'Franked', at: franked ? q.decided_at : null, done: franked },
    { label: email ? 'Drafted in Gmail' : q.kind === 'application' ? 'Applied' : 'Sent', done: dispatched },
    { label: q.kind === 'application' ? 'Callback' : 'Reply', done: delivered },
  ];
}

/** The one item that earns the reversed red plate: due follow-ups and referral asks first, then the best application. */
export function mostUrgent(queue: QueueItem[]): QueueItem | null {
  const pending = queue.filter((q) => q.status === 'pending');
  const rank = (q: QueueItem) =>
    (q.kind === 'followup' ? 0 : q.kind === 'referral' ? 1 : q.kind === 'thank-you' ? 2 : q.kind === 'application' ? 3 : 4) * 1000
    - (q.fit_score ?? 0);
  return pending.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export const fmtClock = (s?: string | null) => {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const fmtStampDate = (s?: string | null) => {
  const d = s ? new Date(s.replace(' ', 'T') + 'Z') : new Date();
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
};
