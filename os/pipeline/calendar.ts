// Interviews land on Google Calendar; this finds them, links them to jobs, and books prep the day before.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { db, setJobStatus, withLock } from '../db.ts';
import { CALENDAR_READ, pool, runAgent, startRun } from '../agent.ts';
import { loadSearch } from '../config.ts';
import { ENGINE_DATA } from '../engine/paths.ts';
import { normCompany } from './ingest.ts';
import { runSkill } from './tailor.ts';

const SCHEMA = {
  type: 'object',
  properties: {
    interviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          calendarId: { type: 'string' },
          company: { type: 'string' },
          round: { type: 'string', description: 'oa | dsa | lld | hld | hm | hr | recruiter-screen | other' },
          start: { type: 'string', description: 'ISO datetime with offset' },
          interviewer: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['calendarId', 'company', 'round', 'start'],
      },
    },
  },
  required: ['interviews'],
};

const ACTIVE = ['awaiting-approval', 'approved', 'applied', 'referral-pending', 'referred', 'interviewing', 'offer'];

/** The newest prep file the skill wrote after `since`, relative to the /files route. */
function prepWritten(since: number) {
  const dir = join(ENGINE_DATA, 'interview-prep');
  if (!existsSync(dir)) return null;
  const fresh = readdirSync(dir).filter((f) => f.endsWith('.md') && statSync(join(dir, f)).mtimeMs >= since)
    .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
  return fresh[0] ? `engine/interview-prep/${fresh[0]}` : null;
}

export function syncInterviews() {
  return withLock('calendar', { found: 0, busy: true } as any, syncNow);
}

async function syncNow() {
  const cfg = loadSearch();
  const run = startRun('calendar');
  const active = db.prepare(`SELECT id, company, status FROM jobs WHERE status IN (${ACTIVE.map(() => '?').join(',')})
    ORDER BY CASE status WHEN 'interviewing' THEN 0 WHEN 'applied' THEN 1 ELSE 2 END`).all(...ACTIVE) as any[];
  const companies = [...new Set(active.map((j) => j.company))];

  const r = await runAgent<{ interviews: any[] }>({
    agent: 'calendar:scan',
    tools: CALENDAR_READ,
    maxTurns: 12,
    schema: SCHEMA,
    prompt: `List events on the primary Google Calendar from now to 14 days ahead that are job interviews, online assessments,
recruiter screens or hiring conversations. Signals: titles/descriptions mentioning interview, round, OA, assessment, HackerRank,
CodeSignal, HackerEarth, recruiter, "<company> <> <name>", Google Meet/Zoom invites from company domains.
Companies in the active pipeline: ${companies.join(', ') || 'none yet'}.
Return each with its calendar event id, company, round type, start time, and interviewer name if shown. Do not modify any events.`,
  });
  if (!r.ok) { run.finish('calendar scan failed', r.error); return { found: 0 }; }

  const upsert = db.prepare(`INSERT INTO interviews (job_id, round, scheduled_at, calendar_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(calendar_id) DO UPDATE SET scheduled_at = excluded.scheduled_at, round = excluded.round`);
  let added = 0;
  for (const i of r.data?.interviews ?? []) {
    // A calendar event never pulls in a role nobody has applied to, or reopens a closed one.
    const job = active.find((j) => normCompany(j.company) === normCompany(i.company));
    upsert.run(job?.id ?? null, i.round, i.start, i.calendarId);
    if (job && job.status !== 'interviewing') { setJobStatus(job.id, 'interviewing', `on calendar: ${i.round}`); job.status = 'interviewing'; }
    added++;
  }

  // Prep anything in the next 48 h that has none yet.
  const due = db.prepare(`SELECT id, job_id, round FROM interviews WHERE prep_path IS NULL AND job_id IS NOT NULL
    AND datetime(scheduled_at) BETWEEN datetime('now') AND datetime('now', '+48 hours')`).all() as any[];
  await pool(due, 1, async (i) => {
    const since = Date.now();
    const p = await runSkill('interview-prep', `${i.job_id} ${i.round}`, { jobId: i.job_id });
    const path = p.ok ? prepWritten(since) : null;
    if (path) db.prepare('UPDATE interviews SET prep_path = ? WHERE id = ?').run(path, i.id);
  });

  run.finish(`${added} interviews on calendar · ${due.length} prepped`);
  return { found: added, prepped: due.length };
}
