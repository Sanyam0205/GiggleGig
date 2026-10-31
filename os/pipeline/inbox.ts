// Inbox watcher: reads recent mail about jobs in the pipeline and moves them without you touching a tracker.
import { db, setJobStatus, withLock } from '../db.ts';
import { GMAIL_READ, runAgent, startRun } from '../agent.ts';
import { loadSearch } from '../config.ts';
import { push } from '../notify.ts';
import { normCompany } from './ingest.ts';

const SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          threadId: { type: 'string' },
          company: { type: 'string' },
          role: { type: 'string', description: 'Role title if the email names one' },
          kind: { type: 'string', enum: ['application-received', 'assessment', 'interview', 'recruiter-reply', 'rejection', 'offer', 'other'] },
          summary: { type: 'string', description: 'One line: what happened and what is asked of the candidate' },
          deadline: { type: 'string', description: 'ISO datetime for an OA deadline or interview slot, if stated' },
          from: { type: 'string', description: 'Sender name and address' },
        },
        required: ['threadId', 'company', 'kind', 'summary'],
      },
    },
  },
  required: ['events'],
};

const ACTIVE = ['awaiting-approval', 'approved', 'applied', 'referral-pending', 'referred', 'interviewing', 'offer'];

export function watchInbox() {
  return withLock('inbox', { events: 0, busy: true } as any, watchNow);
}

async function watchNow() {
  const cfg = loadSearch();
  if (!cfg.inbox.enabled) return { skipped: 'inbox watcher is off' };
  const run = startRun('inbox');
  const companies = (db.prepare(`SELECT DISTINCT company FROM jobs WHERE status IN (${ACTIVE.map(() => '?').join(',')})`).all(...ACTIVE) as any[])
    .map((r) => r.company);
  const seen = new Set((db.prepare(`SELECT thread_id FROM inbox_seen WHERE ts >= datetime('now', '-14 days')`).all() as any[]).map((r) => r.thread_id));
  const hours = cfg.inbox.lookbackHours;

  const r = await runAgent<{ events: any[] }>({
    agent: 'inbox:scan',
    tools: GMAIL_READ,
    maxTurns: 20,
    schema: SCHEMA,
    prompt: `You watch the candidate's inbox for hiring activity. Search Gmail for mail from the last ${Math.ceil(hours / 24) || 1} day(s)
(newer_than:${Math.max(1, Math.ceil(hours / 24))}d) that is about the candidate's own job applications:
application confirmations, online assessments (HackerRank, CodeSignal, HackerEarth, Mettl, iMocha), interview scheduling,
recruiter replies, rejections, offers. Ignore job-alert digests and newsletters.
Companies currently in the pipeline: ${companies.join(', ') || 'none yet'} (others count too if clearly about an application).
Already processed, as thread:kind: ${[...seen].slice(-200).join(', ') || 'none'}. Report a thread again only when its newest message means a different kind.
Return one event per thread with its thread id, classified by its newest message. Do not modify, label or reply to anything.`,
  });
  if (!r.ok) { run.finish('inbox scan failed', r.error); return { events: 0 }; }

  const record = db.prepare(`INSERT OR IGNORE INTO inbox_seen (thread_id, kind, company, job_id, summary) VALUES (?, ?, ?, ?, ?)`);
  const jobs = db.prepare(`SELECT id, company, title, status FROM jobs WHERE status IN (${ACTIVE.map(() => '?').join(',')})`).all(...ACTIVE) as any[];
  let applied = 0;
  for (const e of r.data?.events ?? []) {
    // Keyed by thread and kind: the confirmation and the later rejection usually share one thread.
    const key = `${e.threadId}:${e.kind}`;
    if (seen.has(key)) continue;
    const matches = jobs.filter((j) => normCompany(j.company) === normCompany(e.company));
    // The role the email names; otherwise the only job at that company. With several and no role named, alert but move nothing.
    const job = matches.find((j) => e.role && j.title.toLowerCase().includes(String(e.role).toLowerCase().slice(0, 20))) ?? (matches.length === 1 ? matches[0] : undefined);
    record.run(key, e.kind, e.company, job?.id ?? null, e.summary);
    run.log(`${e.kind} · ${e.company}${job ? ` → ${job.title}` : ' (not in pipeline)'} · ${e.summary}`);

    if (job) {
      if (e.kind === 'rejection') setJobStatus(job.id, 'rejected', e.summary);
      if (e.kind === 'offer') setJobStatus(job.id, 'offer', e.summary);
      if (e.kind === 'assessment' || e.kind === 'interview') {
        if (job.status !== 'interviewing') setJobStatus(job.id, 'interviewing', e.summary);
        db.prepare('INSERT INTO interviews (job_id, round, scheduled_at) VALUES (?, ?, ?)').run(job.id, e.kind === 'assessment' ? 'oa' : 'interview', e.deadline ?? null);
      }
      if (e.kind === 'application-received' && ['approved', 'awaiting-approval'].includes(job.status)) setJobStatus(job.id, 'applied', 'confirmation email');
      applied++;
    }
    if (['assessment', 'interview', 'offer', 'recruiter-reply'].includes(e.kind)) {
      await push(`${e.kind === 'assessment' ? 'Assessment' : e.kind === 'interview' ? 'Interview' : e.kind === 'offer' ? 'Offer' : 'Recruiter reply'} · ${e.company}`,
        `${e.summary}${e.deadline ? `\nWhen: ${e.deadline}` : ''}`, { priority: e.kind === 'offer' || e.kind === 'interview' ? 5 : 4, tags: ['incoming_envelope'] });
    }
  }
  run.finish(`${r.data?.events?.length ?? 0} hiring emails · ${applied} pipeline updates`);
  return { events: r.data?.events?.length ?? 0, applied };
}
