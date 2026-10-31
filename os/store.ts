// Read/write helpers shared by the CLI (which skills call), the pipeline and the desk server.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { db, setJobStatus } from './db.ts';
import { JOBS_OUT } from './paths.ts';
import { renderResume } from './render.ts';
import { alertSlip } from './notify.ts';

export const STAGES = [
  'sourced', 'evaluating', 'shortlisted', 'needs-referral', 'tailoring', 'awaiting-approval', 'approved', 'applied',
  'referral-pending', 'referred', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'skipped', 'filtered',
] as const;

export function jobDir(id: string) {
  const dir = join(JOBS_OUT, id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getJob(id: string): any {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
  if (!job) throw new Error(`no job ${id}`);
  job.fit = job.fit ? JSON.parse(job.fit) : null;
  job.sources = JSON.parse(job.sources);
  return job;
}

/** Writes output/jobs/<id>/jd.md so skills and reviewers can Read the posting. */
export function writeJd(job: any) {
  const lines = [
    `# ${job.title} — ${job.company}`,
    `- **Location:** ${job.location ?? 'n/a'}${job.remote ? ' (remote)' : ''}`,
    `- **Apply:** ${job.apply_url ?? job.url ?? 'n/a'}`,
    `- **Posted:** ${job.posted_at ?? 'unknown'} · **Sources:** ${job.sources.join(', ')}`,
    job.salary_min ? `- **Posted comp:** ${job.salary_min}–${job.salary_max ?? '?'} ${job.currency ?? ''}` : '',
    job.fit ? `- **Fit:** ${job.fit.score}/100 (${job.fit.verdict}) — ${job.fit.rationale}` : '',
    job.fit?.keywords?.length ? `- **Keywords:** ${job.fit.keywords.join(', ')}` : '',
    '', '## Description', '', job.description ?? '(no description captured — fetch the apply URL)',
  ];
  const path = join(jobDir(job.id), 'jd.md');
  writeFileSync(path, lines.filter((l) => l !== '').join('\n') + '\n');
  return path;
}

export function findJobs(q: string, statuses?: string[]) {
  const where: string[] = [];
  const args: any[] = [];
  if (q) { where.push('(company LIKE ? OR title LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (statuses?.length) { where.push(`status IN (${statuses.map(() => '?').join(',')})`); args.push(...statuses); }
  else where.push(`status != 'filtered'`);
  return db.prepare(`SELECT id, company, title, location, status, fit_score FROM jobs
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY fit_score DESC NULLS LAST, first_seen DESC LIMIT 50`).all(...args);
}

export function addManualJob(url: string, description: string, company = 'Unknown', title = 'Unknown role') {
  const key = `manual|${url}`;
  const id = createHash('sha1').update(key).digest('hex').slice(0, 12);
  db.prepare(`INSERT OR IGNORE INTO jobs (id, dedupe_key, source, sources, company, title, url, apply_url, description)
    VALUES (?, ?, 'manual', '["manual"]', ?, ?, ?, ?, ?)`).run(id, key, company, title, url, url, description);
  return id;
}

export function addQueue(kind: string, jobId: string | null, title: string, body: object, opts: { dueAt?: string; contactId?: number } = {}) {
  const { lastInsertRowid } = db.prepare(`INSERT INTO queue (kind, job_id, contact_id, title, body, status, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(kind, jobId, opts.contactId ?? null, title, JSON.stringify(body), opts.dueAt ? 'scheduled' : 'pending', opts.dueAt ?? null);
  return Number(lastInsertRowid);
}

/** After resume-tailor: render the PDF, move the job to awaiting-approval, and queue the application once. */
export function markTailored(id: string) {
  const job = getJob(id);
  const dir = jobDir(id);
  const json = join(dir, 'resume.json');
  if (!existsSync(json)) throw new Error(`${json} missing — run /resume-tailor ${id} first`);
  const rendered = renderResume(json);
  const pdf = rendered.pdf;
  const review = existsSync(join(dir, 'review.json')) ? JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8')) : null;
  const existing = db.prepare(`SELECT id FROM queue WHERE kind = 'application' AND job_id = ? AND status IN ('pending','approved')`).get(id) as any;
  const body = {
    applyUrl: job.apply_url ?? job.url,
    resume: `output/jobs/${id}/resume.md`,
    pdf: pdf ? `output/jobs/${id}/resume.pdf` : null,
    html: `output/jobs/${id}/resume.html`,
    pages: rendered.pages,
    fit: job.fit?.score ?? null,
    positioning: review?.positioning ?? null,
    coverage: review?.coverage ?? null,
    gaps: review?.gaps ?? [],
    reviews: review?.reviews ?? [],
    ...(existsSync(join(dir, 'application.json')) ? { kit: JSON.parse(readFileSync(join(dir, 'application.json'), 'utf8')) } : {}),
  };
  if (existing) {
    // Re-tailoring refreshes the slip in place, keeping any application kit already attached.
    const old = JSON.parse((db.prepare('SELECT body FROM queue WHERE id = ?').get(existing.id) as any).body);
    db.prepare('UPDATE queue SET body = ? WHERE id = ?').run(JSON.stringify({ ...old, ...body }), existing.id);
  } else {
    const qid = addQueue('application', id, `${job.title} · ${job.company}`, body);
    void alertSlip(qid, `Resume ready · ${job.company}`, `${job.title}\nCoverage ${review?.coverage ?? '?'} · fit ${job.fit?.score ?? '?'}. Approve to open the apply page.`);
  }
  setJobStatus(id, 'awaiting-approval', `coverage ${review?.coverage ?? '?'}`);
  return { pdf, pages: rendered.pages, scale: rendered.scale, coverage: review?.coverage ?? null };
}

export function saveFit(id: string, fit: any) {
  db.prepare(`UPDATE jobs SET fit_score = ?, fit = ?, updated_at = datetime('now') WHERE id = ?`).run(fit.score, JSON.stringify(fit), id);
}

export function addContact(company: string, name: string, role?: string, linkedin?: string, email?: string, relationship = 'cold') {
  const existing = db.prepare('SELECT id FROM contacts WHERE company = ? AND name = ?').get(company, name) as any;
  if (existing) return existing.id as number;
  const { lastInsertRowid } = db.prepare(`INSERT INTO contacts (company, name, role, linkedin, email, relationship) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(company, name, role || null, linkedin || null, email || null, relationship);
  return Number(lastInsertRowid);
}

/** Lowest-scoring question types across mocks and debriefs — interview-prep and mock-interview target these. */
export function weakSpots() {
  const rows = db.prepare('SELECT scores FROM interviews WHERE scores IS NOT NULL').all() as any[];
  const byType: Record<string, { total: number; n: number }> = {};
  for (const r of rows) {
    for (const g of JSON.parse(r.scores)) {
      const t = (byType[g.type] ??= { total: 0, n: 0 });
      t.total += g.total ?? g.structure + g.specificity + g.skill;
      t.n++;
    }
  }
  return Object.entries(byType).map(([type, { total, n }]) => ({ type, avg: +(total / n).toFixed(1), answers: n }))
    .sort((a, b) => a.avg - b.avg);
}

export function pipelineCounts() {
  return db.prepare(`SELECT status, COUNT(*) n FROM jobs WHERE status != 'filtered' GROUP BY status`).all();
}

/** Week funnel for /weekly-retro. */
export function retro(weekStart: string) {
  const end = `date('${weekStart}', '+7 days')`;
  const moved = (s: string) => (db.prepare(`SELECT COUNT(DISTINCT job_id) n FROM job_history WHERE status = ? AND ts >= ? AND ts < ${end}`)
    .get(s, weekStart) as any).n;
  const queued = (k: string, st?: string) => (db.prepare(`SELECT COUNT(*) n FROM queue WHERE kind = ? ${st ? 'AND status = ?' : ''}
    AND created_at >= ? AND created_at < ${end}`).get(...(st ? [k, st, weekStart] : [k, weekStart])) as any).n;
  return {
    weekStart,
    sourced: (db.prepare(`SELECT COUNT(*) n FROM jobs WHERE first_seen >= ? AND first_seen < ${end}`).get(weekStart) as any).n,
    shortlisted: moved('shortlisted'), needsReferral: moved('needs-referral'), tailored: moved('awaiting-approval'),
    applied: moved('applied'), referred: moved('referred'), interviewing: moved('interviewing'), offers: moved('offer'),
    rejected: moved('rejected'),
    connectionBatches: queued('connection'), referralAsks: queued('referral'), referralAsksSent: queued('referral', 'done'),
    contactsByRelationship: db.prepare('SELECT relationship, COUNT(*) n FROM contacts GROUP BY relationship').all(),
    agentRuns: db.prepare(`SELECT agent, COUNT(*) runs, SUM(status = 'failed') failed, ROUND(SUM(cost_usd), 2) usd
      FROM runs WHERE started_at >= ? AND started_at < ${end} GROUP BY agent`).all(weekStart),
    weakSpots: weakSpots(),
  };
}
