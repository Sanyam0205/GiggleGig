// The one map of where a job lives. Every status belongs to exactly one lane, so a job is always findable,
// and lanes are ordered the way a job actually moves through the search.
import type { MatchRow } from '../api';

export interface Lane { key: string; title: string; sub: string; statuses: string[]; open?: boolean }

export const LANES: Lane[] = [
  { key: 'inbox', title: 'Inbox', sub: 'Found by the scouts; triage and evaluation decide what moves on', statuses: ['sourced'] },
  { key: 'working', title: 'Being worked on', sub: 'An agent is evaluating or tailoring right now', statuses: ['evaluating', 'tailoring'], open: true },
  { key: 'decide', title: 'Ready to decide', sub: 'Evaluated: tailor a CV, or get a referral first', statuses: ['shortlisted', 'needs-referral'], open: true },
  { key: 'you', title: 'Waiting for you', sub: 'CV ready: review, approve and apply', statuses: ['awaiting-approval', 'approved'], open: true },
  { key: 'applied', title: 'Applied', sub: 'Sent, or a referral is in motion', statuses: ['applied', 'referral-pending', 'referred'], open: true },
  { key: 'interviewing', title: 'Interviewing', sub: 'Assessments, interviews and offers', statuses: ['interviewing', 'offer'], open: true },
  { key: 'closed', title: 'Closed', sub: 'Skipped, rejected, withdrawn or accepted, kept for the record', statuses: ['skipped', 'rejected', 'withdrawn', 'accepted'] },
];

export const laneOf = (status: string) => LANES.find((l) => l.statuses.includes(status)) ?? LANES[0];

/** One line on what is happening to this job and what moves it on. */
export function nextStep(j: MatchRow): string {
  switch (j.status) {
    case 'sourced':
      if (j.triage?.blocked) return `Needs your answer: ${j.triage.blocked}`;
      if ((j.triage?.evalFailed ?? 0) >= 2) return `Evaluation failed ${j.triage?.evalFailed} times: open the job and press Evaluate to retry`;
      if (j.triage) return j.triage.verdict === 'PASS' ? `Triage PASS ${j.triage.score}/5: next, the full A–G evaluation` : `Triage ${j.triage.verdict} ${j.triage.score}/5: open the job and press Evaluate to override`;
      return 'Not triaged yet: the next scoring run picks it up';
    case 'evaluating': return 'Writing the A–G evaluation report…';
    case 'tailoring': return 'Tailoring the CV: fact check, one-page render…';
    case 'shortlisted': return 'Apply: press Tailor CV';
    case 'needs-referral': return `${j.decision ?? 'Consider'}: get a referral, then tailor`;
    case 'awaiting-approval': return 'CV ready: review and approve on Today';
    case 'approved': return 'Approved: open the apply page, then mark applied';
    case 'applied': return 'Applied: follow-ups are scheduled';
    case 'referral-pending': return 'Referral asked: waiting on your contact';
    case 'referred': return 'Referred: apply if you have not yet';
    case 'interviewing': return 'Interviewing: prep is on the Interviews tab';
    case 'offer': return 'Offer: run /negotiate';
    case 'accepted': return 'Accepted';
    case 'rejected': return 'Rejected';
    case 'withdrawn': return 'Withdrawn or closed';
    case 'skipped': return j.triage && !j.report_num ? `Triage ${j.triage.verdict}: ${j.triage.reason}` : j.decision === 'Skip' ? 'Not a fit' : 'Skipped';
    default: return j.status;
  }
}

/** Moved in the last 15 minutes: highlighted so you can see where the click sent it. */
export const justMoved = (updatedAt?: string) => {
  if (!updatedAt) return false;
  return Date.now() - Date.parse(updatedAt.replace(' ', 'T') + 'Z') < 15 * 60_000;
};
