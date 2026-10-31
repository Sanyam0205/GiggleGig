// The desk's API: JSON endpoints, a live SSE stream tailed from SQLite, and the built React app.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { candidateState, db, kvGet, kvSet, setCandidateState, setJobStatus } from './db.ts';
import { GMAIL_DRAFT, runAgent } from './agent.ts';
import { loadSearch, loadTargets, saveSearch } from './config.ts';
import { DESK_DIR, OUTPUT_DIR, ROOT, findPython } from './paths.ts';
import { addQueue, getJob, jobDir, pipelineCounts, STAGES, weakSpots } from './store.ts';
import { importConnections, warmCounts, warmPaths } from './contacts.ts';
import { normCompany } from './pipeline/ingest.ts';
import { ntfyTopic, push } from './notify.ts';
import './engine/sync.ts';
import { syncFromTracker } from './engine/sync.ts';
import { ENGINE_DATA } from './engine/paths.ts';
import { pdfFor } from './engine/tailor.ts';
import { bucketFor } from './engine/reports.ts';
import { engineScript } from './engine/run.ts';
import { resetCandidateWorkspace } from './reset.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8',
};

// LAN access (your phone) needs a token once; localhost never does.
function token() {
  let t = kvGet('desk_token');
  if (!t) { t = randomBytes(12).toString('base64url'); kvSet('desk_token', t); }
  return t;
}

function authorized(req: IncomingMessage, url: URL) {
  const addr = req.socket.remoteAddress ?? '';
  if (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1') return true;
  const cookie = /(?:^|;\s*)desk=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  return cookie === token() || url.searchParams.get('t') === token();
}

function cleanBrand(value: unknown) {
  return JSON.stringify(value).replace(/career[ -]?ops(?: engine)?/gi, 'GiggleGig')
    .replace(/Job Search OS/gi, 'GiggleGig').replace(/Placement Desk/gi, 'GiggleGig');
}

const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(cleanBrand(body));
};

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += b.length;
    if (size > 7 * 1024 * 1024) throw new Error('request body exceeds 7 MB');
    chunks.push(b);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const parseQueue = (r: any) => (r ? { ...r, body: JSON.parse(r.body) } : r);

function readIf(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

// ── pipelines started from the desk run as child processes, like the scheduler does ──
const running = new Map<string, number>();
function startPipeline(cmd: string, args: string[] = [], key = args.length ? `${cmd}:${args.join(',')}` : cmd) {
  if (running.has(key)) return { already: true };
  // Own process group, so Stop can end the pipeline and every agent it spawned in one signal.
  const child = spawn(process.execPath, [join(ROOT, 'os/cli.ts'), cmd, ...args], { cwd: ROOT, stdio: 'ignore', env: process.env, detached: true });
  running.set(key, child.pid ?? 0);
  child.on('close', () => running.delete(key));
  return { started: key };
}

// Platforms the scouts pull from. `prefix` matches the source tags stored on each job.
const PLATFORMS: { key: string; group: string; name: string; prefix: string; how: string }[] = [
  { key: 'jobspy:linkedin', group: 'jobspy', name: 'LinkedIn', prefix: 'jobspy:linkedin', how: 'Public guest listings via JobSpy' },
  { key: 'jobspy:naukri', group: 'jobspy', name: 'Naukri', prefix: 'jobspy:naukri', how: 'Public listings via JobSpy' },
  { key: 'jobspy:indeed', group: 'jobspy', name: 'Indeed', prefix: 'jobspy:indeed', how: 'Public listings via JobSpy' },
  { key: 'jobspy:glassdoor', group: 'jobspy', name: 'Glassdoor', prefix: 'jobspy:glassdoor', how: 'Public listings via JobSpy' },
  { key: 'jobspy:google', group: 'jobspy', name: 'Google Jobs', prefix: 'jobspy:google', how: 'Google for Jobs via JobSpy' },
  { key: 'jsearch:linkedin', group: 'apis', name: 'LinkedIn (via JSearch)', prefix: 'jsearch:linkedin', how: 'Google for Jobs aggregator, RapidAPI key' },
  { key: 'jsearch:naukri', group: 'apis', name: 'Naukri (via JSearch)', prefix: 'jsearch:naukri', how: 'Google for Jobs aggregator, RapidAPI key' },
  { key: 'jsearch:wellfound', group: 'apis', name: 'Wellfound (via JSearch)', prefix: 'jsearch:wellfound', how: 'Google for Jobs aggregator, RapidAPI key' },
  { key: 'jsearch:', group: 'apis', name: 'Other boards (via JSearch)', prefix: 'jsearch:', how: 'Instahyre, Cutshort, Foundit, company sites…' },
  { key: 'adzuna', group: 'apis', name: 'Adzuna India', prefix: 'adzuna', how: 'Aggregator API, free key' },
  { key: 'jooble', group: 'apis', name: 'Jooble', prefix: 'jooble', how: 'Aggregator API, free key' },
  { key: 'boards', group: 'ats', name: 'Company boards', prefix: 'boards', how: 'Scan of every target company board and career page' },
  { key: 'greenhouse', group: 'ats', name: 'Greenhouse boards', prefix: 'greenhouse', how: 'Public board API, per target company' },
  { key: 'lever', group: 'ats', name: 'Lever boards', prefix: 'lever', how: 'Public board API, per target company' },
  { key: 'ashby', group: 'ats', name: 'Ashby boards', prefix: 'ashby', how: 'Public board API, per target company' },
  { key: 'workable', group: 'ats', name: 'Workable boards', prefix: 'workable', how: 'Public board API, per target company' },
  { key: 'smartrecruiters', group: 'ats', name: 'SmartRecruiters boards', prefix: 'smartrecruiters', how: 'Public board API, per target company' },
  { key: 'gmail:wellfound', group: 'gmail', name: 'Wellfound', prefix: 'gmail:wellfound', how: 'Job-alert emails, read by the Gmail scout' },
  { key: 'gmail:weekday', group: 'gmail', name: 'Weekday', prefix: 'gmail:weekday', how: 'Job-alert emails, read by the Gmail scout' },
  { key: 'gmail:linkedin', group: 'gmail', name: 'LinkedIn alerts', prefix: 'gmail:linkedin', how: 'Job-alert emails, read by the Gmail scout' },
  { key: 'gmail:naukri', group: 'gmail', name: 'Naukri alerts', prefix: 'gmail:naukri', how: 'Job-alert emails, read by the Gmail scout' },
  { key: 'gmail:recruiter', group: 'gmail', name: 'Recruiter emails', prefix: 'gmail:recruiter', how: 'Recruiters writing about a specific role' },
  { key: 'gmail:', group: 'gmail', name: 'Other alert emails', prefix: 'gmail:', how: 'Instahyre, Cutshort, Hirist, Otta, YC and others' },
  { key: 'remoteok', group: 'remoteok', name: 'RemoteOK', prefix: 'remoteok', how: 'Public JSON feed' },
  { key: 'remotive', group: 'remotive', name: 'Remotive', prefix: 'remotive', how: 'Public JSON feed' },
  { key: 'hackernews', group: 'hackernews', name: 'HN “Who is hiring”', prefix: 'hackernews', how: 'Monthly thread via the Algolia API' },
  { key: 'web:', group: 'web', name: 'Open web search', prefix: 'web:', how: 'Search agent: ATS pages, Wellfound, career sites' },
  { key: 'manual', group: 'manual', name: 'Added by you', prefix: 'manual', how: '/quick-start or node os/cli.ts add' },
];

const GROUP_ENABLED = (cfg: ReturnType<typeof loadSearch>, group: string) => ({
  ats: cfg.sources.ats, jobspy: cfg.sources.jobspy.enabled, remoteok: cfg.sources.remoteok, remotive: cfg.sources.remotive,
  hackernews: cfg.sources.hackernews, gmail: cfg.sources.gmailAlerts.enabled, web: cfg.sources.webSearch.enabled, manual: true,
  apis: cfg.sources.apis.jsearch || cfg.sources.apis.adzuna || cfg.sources.apis.jooble,
} as Record<string, boolean>)[group];

function sourcesReport() {
  const cfg = loadSearch();
  const rows = db.prepare('SELECT sources, status, fit_score, last_seen FROM jobs').all() as any[];
  const stats = new Map<string, { found: number; passed: number; scored: number; matched: number; lastSeen: string | null }>();
  const specific = PLATFORMS.filter((p) => !p.prefix.endsWith(':'));
  for (const r of rows) {
    for (const src of new Set<string>(JSON.parse(r.sources))) {
      // Exact platform first; "gmail:otta" etc. fall through to the catch-all for its group.
      const p = specific.find((x) => src.startsWith(x.prefix)) ?? PLATFORMS.find((x) => src.startsWith(x.prefix));
      if (!p) continue;
      const s = stats.get(p.key) ?? { found: 0, passed: 0, scored: 0, matched: 0, lastSeen: null };
      s.found++;
      if (r.status !== 'filtered') s.passed++;
      if (r.fit_score != null) s.scored++;
      if (r.fit_score != null && r.fit_score >= cfg.thresholds.skip) s.matched++;
      if (!s.lastSeen || r.last_seen > s.lastSeen) s.lastSeen = r.last_seen;
      stats.set(p.key, s);
    }
  }
  const lastScout = db.prepare(`SELECT id, started_at, ended_at, status FROM runs WHERE agent = 'scout' ORDER BY id DESC LIMIT 1`).get() as any;
  const lines = lastScout ? (db.prepare('SELECT text FROM events WHERE run_id = ? ORDER BY id').all(lastScout.id) as any[]).map((e) => e.text) : [];
  const agentRuns = db.prepare(`SELECT agent, status, started_at, error FROM runs WHERE id IN
    (SELECT MAX(id) FROM runs WHERE agent IN ('scout:gmail', 'scout:web') GROUP BY agent)`).all() as any[];
  return {
    platforms: PLATFORMS.map((p) => ({
      ...p,
      enabled: GROUP_ENABLED(cfg, p.group) && (p.group !== 'jobspy' || cfg.sources.jobspy.sites.includes(p.key.split(':')[1])),
      ...(stats.get(p.key) ?? { found: 0, passed: 0, scored: 0, matched: 0, lastSeen: null }),
    })),
    groups: {
      ats: { enabled: cfg.sources.ats, boards: loadTargets().filter((t) => t.ats && t.slug).length, careerSitesOnly: loadTargets().filter((t) => !t.slug).length },
      jobspy: { enabled: cfg.sources.jobspy.enabled, sites: cfg.sources.jobspy.sites, locations: cfg.sources.jobspy.locations, python: Boolean(findPython()) },
      gmail: { enabled: cfg.sources.gmailAlerts.enabled, lookbackDays: cfg.sources.gmailAlerts.lookbackDays },
      web: { enabled: cfg.sources.webSearch.enabled },
      apis: {
        enabled: cfg.sources.apis.jsearch || cfg.sources.apis.adzuna || cfg.sources.apis.jooble,
        keys: { jsearch: Boolean(process.env.JSEARCH_API_KEY), adzuna: Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY), jooble: Boolean(process.env.JOOBLE_API_KEY) },
      },
      remoteok: { enabled: cfg.sources.remoteok }, remotive: { enabled: cfg.sources.remotive }, hackernews: { enabled: cfg.sources.hackernews },
    },
    lastScout: lastScout ? { ...lastScout, log: lines } : null,
    agentRuns,
    automation: cfg.automation,
    thresholds: cfg.thresholds,
    running: [...running.keys()],
  };
}

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function kill(pid: number) {
  for (const target of [-pid, pid]) {
    try { process.kill(target, 'SIGTERM'); } catch { /* not a group leader / already gone */ }
  }
}

/**
 * Stop one run. An agent run (pid = its agent process) ends alone and its pipeline moves on.
 * A pipeline run (pid = the cli process, e.g. scout / scorer / tailor) ends with every agent it owns.
 */
function stopRun(id: number) {
  const run = db.prepare(`SELECT id, pid, owner_pid FROM runs WHERE id = ? AND status = 'running'`).get(id) as any;
  if (!run) return { stopped: 0 };
  const isPipeline = run.pid != null && run.pid === run.owner_pid;
  const victims = isPipeline
    ? (db.prepare(`SELECT id FROM runs WHERE status = 'running' AND owner_pid = ?`).all(run.pid) as any[]).map((r) => r.id)
    : [id];
  const mark = db.prepare(`UPDATE runs SET status = 'stopped', error = 'stopped from the desk', ended_at = datetime('now'),
    duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER) WHERE id = ? AND status = 'running'`);
  for (const v of victims) {
    mark.run(v);
    db.prepare(`INSERT INTO events (run_id, type, text) VALUES (?, 'error', 'Stopped from the desk')`).run(v);
  }
  // The desk server's own process never gets signalled (it owns gmail-draft runs).
  if (run.pid && run.pid !== process.pid) kill(run.pid);
  const stuck = db.prepare(`SELECT DISTINCT j.id FROM jobs j JOIN runs r ON r.job_id = j.id
    WHERE r.id IN (${victims.map(() => '?').join(',')}) AND j.status = 'tailoring'`).all(...victims) as any[];
  for (const j of stuck) setJobStatus(j.id, 'shortlisted', 'tailoring stopped from the desk');
  return { stopped: victims.length };
}

function stopAll() {
  const ids = (db.prepare(`SELECT id FROM runs WHERE status = 'running' ORDER BY id`).all() as any[]).map((r) => r.id);
  for (const id of ids) stopRun(id);
  for (const [key, pid] of running) { kill(pid); running.delete(key); }
  return { stopped: ids.length };
}

/** Runs whose process vanished (crash, reboot, launchd kill) would otherwise show "running" forever,
 *  and their jobs would sit in "Being worked on" forever. Both are put back. */
function reap() {
  const stranded = db.prepare(`SELECT id, status, report_num, score5, decision FROM jobs j WHERE status IN ('evaluating','tailoring')
    AND updated_at <= datetime('now', '-2 minutes')
    AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.job_id = j.id AND r.status = 'running')`).all() as any[];
  for (const j of stranded) {
    const back = j.status === 'evaluating' && !j.report_num ? 'sourced' : bucketFor(j.decision, j.score5 ?? undefined);
    db.prepare('UPDATE jobs SET pending_report = NULL WHERE id = ?').run(j.id);
    setJobStatus(j.id, back, `${j.status} stopped before finishing; moved back`);
  }
  const rows = db.prepare(`SELECT id, pid FROM runs WHERE status = 'running' AND pid IS NOT NULL
    AND started_at <= datetime('now', '-15 seconds')`).all() as any[];
  for (const r of rows) {
    if (!alive(r.pid)) db.prepare(`UPDATE runs SET status = 'failed', error = 'process exited without finishing', ended_at = datetime('now')
      WHERE id = ? AND status = 'running'`).run(r.id);
  }
}

/** Email-channel approvals become Gmail drafts; you press Send in Gmail. */
function draftEmail(item: any) {
  const b = item.body;
  return runAgent({
    agent: 'gmail-draft',
    jobId: item.job_id ?? undefined,
    model: loadSearch().models.scout,
    tools: GMAIL_DRAFT,
    maxTurns: 6,
    prompt: `Create a Gmail DRAFT (do not send) with exactly this content.
To: ${b.to}
Subject: ${b.subject ?? ''}
Body:
${b.body}
${b.threadId ? `Reply in thread ${b.threadId}.` : ''}
Reply with the draft id only.`,
  }).then((r) => {
    db.prepare(`UPDATE queue SET status = ?, decided_at = datetime('now') WHERE id = ?`).run(r.ok ? 'done' : 'approved', item.id);
    return r;
  });
}

function decide(id: number, action: string, edits?: any) {
  const item = parseQueue(db.prepare('SELECT * FROM queue WHERE id = ?').get(id));
  if (!item) throw new Error('no such queue item');
  if (edits) {
    item.body = { ...item.body, ...edits };
    db.prepare('UPDATE queue SET body = ? WHERE id = ?').run(JSON.stringify(item.body), id);
  }
  const set = (status: string) => db.prepare(`UPDATE queue SET status = ?, decided_at = datetime('now') WHERE id = ?`).run(status, id);

  if (action === 'reject') {
    set('rejected');
    if (item.kind === 'application' && item.job_id) setJobStatus(item.job_id, 'skipped', 'rejected on desk');
    return { status: 'rejected' };
  }

  if (action === 'approve') {
    if (item.body.channel === 'email') {
      set('approved');
      draftEmail(item);
      return { status: 'approved', drafting: true };
    }
    set('approved');
    if (item.kind === 'application' && item.job_id) setJobStatus(item.job_id, 'approved');
    return { status: 'approved' };
  }

  if (action === 'done') {
    set('done');
    if (item.kind === 'application' && item.job_id) setJobStatus(item.job_id, 'applied', 'applied from desk');
    if (item.contact_id) db.prepare(`UPDATE contacts SET relationship = CASE relationship WHEN 'cold' THEN 'requested' ELSE relationship END,
      last_contact_at = datetime('now') WHERE id = ?`).run(item.contact_id);
    // Referral sequences: schedule the next steps relative to now.
    for (const step of item.body.sequence?.next ?? []) {
      const due = new Date(Date.now() + step.afterDays * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
      addQueue('followup', item.job_id, `Follow-up · ${item.title}`, { ...item.body, body: step.body, sequence: undefined }, { dueAt: due, contactId: item.contact_id ?? undefined });
    }
    if (item.kind === 'referral' && item.job_id) setJobStatus(item.job_id, 'referral-pending', `asked via desk`);
    return { status: 'done' };
  }
  throw new Error(`unknown action ${action}`);
}

/** Companies seen in the pipeline (search box suggestions + list). */
function companies(q: string) {
  const warm = warmCounts();
  const targets = new Map(loadTargets().map((t) => [normCompany(t.name), t]));
  const rows = db.prepare(`SELECT company, COUNT(*) n, SUM(status != 'filtered') feasible, MAX(fit_score) best,
      SUM(fit_score >= 60) matched, MAX(last_seen) seen FROM jobs WHERE company LIKE ? GROUP BY company
      ORDER BY matched DESC, best DESC NULLS LAST, feasible DESC LIMIT 60`).all(`%${q}%`) as any[];
  return rows.filter((r) => r.feasible > 0 || q).map((r) => {
    const t = targets.get(normCompany(r.company));
    return { ...r, warm: warm.get(normCompany(r.company)) ?? 0, tier: t?.tier ?? null, board: t?.slug ? `${t.ats}/${t.slug}` : null };
  });
}

function companyDetail(name: string) {
  const key = normCompany(name);
  const jobs = (db.prepare(`SELECT id, company, title, location, remote, status, fit_score, fit, sources, first_seen, apply_url, salary_min, salary_max, currency, report_num, score5, decision, confidence, legitimacy, archetype, summary, triage, engine_status
    FROM jobs WHERE status != 'filtered' AND company LIKE ? ORDER BY fit_score DESC NULLS LAST, first_seen DESC`).all(`%${name}%`) as any[])
    .filter((j) => normCompany(j.company).includes(key) || key.includes(normCompany(j.company)))
    .map((j) => decorate(j));
  const reasons = db.prepare(`SELECT CASE WHEN filter_reason LIKE 'title: excluded%' THEN 'too senior or wrong role type'
      WHEN filter_reason LIKE 'title: no target%' THEN 'not a software role' WHEN filter_reason LIKE 'stale%' THEN 'older than ${loadSearch().maxAgeDays} days'
      ELSE 'location' END reason, COUNT(*) n FROM jobs WHERE status = 'filtered' AND company LIKE ? GROUP BY reason ORDER BY n DESC`).all(`%${name}%`) as any[];
  const filtered = reasons.reduce((n, r) => n + r.n, 0);
  const target = loadTargets().find((t) => normCompany(t.name) === key) ?? null;
  const slug = key.replace(/[^a-z0-9]+/g, '-');
  const research = readIf(join(OUTPUT_DIR, 'companies', `${slug}.md`));
  const searches = db.prepare(`SELECT id, status, started_at, ended_at, summary FROM runs WHERE agent LIKE ? ORDER BY id DESC LIMIT 1`).get(`company:${name}`) ?? null;
  return { name, jobs, filtered, filteredReasons: reasons, target, research, warmPaths: warmPaths(name), lastSearch: searches };
}

function today() {
  return {
    queue: (db.prepare(`SELECT q.*, j.company, j.title AS job_title, j.fit_score FROM queue q LEFT JOIN jobs j ON j.id = q.job_id
      WHERE q.status IN ('pending','approved') ORDER BY q.status = 'approved' DESC, j.fit_score DESC NULLS LAST, q.created_at`).all() as any[]).map(parseQueue),
    scheduled: db.prepare(`SELECT id, kind, title, due_at FROM queue WHERE status = 'scheduled' ORDER BY due_at LIMIT 10`).all(),
    interviews: db.prepare(`SELECT i.*, j.company, j.title FROM interviews i LEFT JOIN jobs j ON j.id = i.job_id
      WHERE i.scheduled_at >= datetime('now', '-2 hours') ORDER BY i.scheduled_at LIMIT 5`).all(),
    newMatches: (() => {
      const warm = warmCounts();
      return (db.prepare(`SELECT id, company, title, location, remote, fit_score, fit, status, sources, first_seen, apply_url,
        salary_min, salary_max, currency, report_num, score5, decision, confidence, legitimacy, archetype, summary, triage, engine_status FROM jobs WHERE status IN ('shortlisted','needs-referral')
        ORDER BY first_seen DESC, fit_score DESC LIMIT 12`).all() as any[]).map((j) => {
        return { ...decorate(j), warm: warm.get(normCompany(j.company)) ?? 0 };
      });
    })(),
    recent: (() => {
      const warm = warmCounts();
      return (db.prepare(`SELECT id, company, title, location, remote, fit_score, fit, status, sources, first_seen, apply_url,
        salary_min, salary_max, currency, updated_at, report_num, score5, decision, confidence, legitimacy, archetype, summary, triage, engine_status FROM jobs WHERE status IN ('evaluating','tailoring')
        OR (updated_at >= datetime('now', '-1 day') AND status NOT IN ('sourced','filtered'))
        ORDER BY status IN ('evaluating','tailoring') DESC, updated_at DESC LIMIT 20`).all() as any[]).map((j) => {
        return { ...decorate(j), warm: warm.get(normCompany(j.company)) ?? 0 };
      });
    })(),
    stages: pipelineCounts(),
    running: db.prepare(`SELECT id, agent, job_id, started_at FROM runs WHERE status = 'running' ORDER BY id DESC`).all(),
    lastBriefing: db.prepare(`SELECT started_at, ended_at, status, summary FROM runs WHERE agent = 'scout' ORDER BY id DESC LIMIT 1`).get() ?? null,
  };
}

/**
 * One job row as the desk sees it. career-ops reports win: 1–5 score, decision, confidence, legitimacy, and an
 * eligibility row built from Block B's requirement table. Roles scored before the engine keep their legacy fields.
 */
function decorate(j: any) {
  const fit = j.fit ? JSON.parse(j.fit) : null;
  const sum = j.summary ? JSON.parse(j.summary) : null;
  const tri = j.triage ? JSON.parse(j.triage) : null;
  const MATCH: Record<string, string> = { strong: 'met', partial: 'unknown', missing: 'unmet', na: 'unknown' };
  const reqs = (sum?.requirement_importance ?? []) as any[];
  const key = reqs.filter((r) => r.importance === 'critical' || r.importance === 'high');
  const eligibility = sum
    ? (key.length >= 3 ? key : reqs).slice(0, 6).map((r) => ({ criterion: String(r.requirement).replace(/\s+/g, ' ').slice(0, 48), status: MATCH[r.match] ?? 'unknown', importance: r.importance }))
    : fit?.eligibility ?? null;
  return {
    ...j, fit: undefined, summary: undefined, triage: tri,
    verdict: sum ? ({ Apply: 'apply', Consider: 'referral-only', 'Research first': 'referral-only', Skip: 'skip' } as Record<string, string>)[sum.final_decision] ?? null : fit?.verdict ?? null,
    rationale: sum ? (sum.top_strengths?.[0] ?? sum.next_action ?? null) : fit?.rationale ?? tri?.reason ?? null,
    evidence: sum ? (sum.top_strengths?.length ? `**${sum.top_strengths[0]}**${sum.hard_stops?.length ? ` · blocker: ${sum.hard_stops[0]}` : ''}` : null) : fit?.evidence ?? null,
    salaryEst: fit?.salary ?? null,
    advertisedComp: sum?.advertised_comp ?? null,
    eligibility,
    dimensions: fit?.dimensions ?? null,
    hardStops: sum?.hard_stops ?? [], softGaps: sum?.soft_gaps ?? [], nextAction: sum?.next_action ?? null,
  };
}

function jobDetail(id: string) {
  const job = getJob(id);
  const dir = jobDir(id);
  const files = ['resume.md', 'review.json', 'jd.md', 'cover-letter.md', 'work-product.md', 'outreach.md', 'negotiation.md'];
  return {
    ...job,
    history: db.prepare('SELECT status, note, ts FROM job_history WHERE job_id = ? ORDER BY ts').all(id),
    runs: db.prepare('SELECT id, agent, status, started_at, duration_ms, cost_usd FROM runs WHERE job_id = ? ORDER BY id DESC').all(id),
    queue: (db.prepare('SELECT * FROM queue WHERE job_id = ? ORDER BY id DESC').all(id) as any[]).map(parseQueue),
    files: Object.fromEntries(files.map((f) => [f, readIf(join(dir, f))]).filter(([, v]) => v !== null)),
    pdf: existsSync(join(dir, 'resume.pdf')) ? `/files/jobs/${id}/resume.pdf` : null,
    html: existsSync(join(dir, 'resume.html')) ? `/files/jobs/${id}/resume.html` : null,
    kit: readIf(join(dir, 'application.json')) ? JSON.parse(readIf(join(dir, 'application.json'))!) : null,
    warmPaths: warmPaths(job.company),
    engine: job.report_num ? {
      report: job.report_num, score: job.score5, decision: job.decision, confidence: job.confidence, legitimacy: job.legitimacy,
      archetype: job.archetype, status: job.engine_status, summary: job.summary ? JSON.parse(job.summary) : null,
      markdown: job.report_path ? readIf(job.report_path) : null,
      cv: (() => { const p = pdfFor(String(job.report_num)); return p ? { pdf: `/files/engine/${p.pdf.slice(ENGINE_DATA.length + 1)}`, html: p.html ? `/files/engine/${p.html.slice(ENGINE_DATA.length + 1)}` : null } : null; })(),
    } : null,
    triage: job.triage ? JSON.parse(job.triage) : null,
  };
}

// ── SSE: tail the DB so runs started by the scheduler show up live too ──
const clients = new Set<ServerResponse>();
let cursor = { event: 0, queue: '', job: '' };
function initCursor() {
  cursor.event = (db.prepare('SELECT COALESCE(MAX(id), 0) m FROM events').get() as any).m;
}
function tick() {
  if (!clients.size) return;
  const events = db.prepare(`SELECT e.id, e.run_id, e.ts, e.type, e.text, r.agent FROM events e JOIN runs r ON r.id = e.run_id
    WHERE e.id > ? ORDER BY e.id LIMIT 500`).all(cursor.event) as any[];
  if (events.length) cursor.event = events.at(-1).id;
  const qStamp = String((db.prepare(`SELECT COUNT(*) || ':' || COALESCE(MAX(decided_at), '') || ':' || COALESCE(MAX(id), 0) s FROM queue`).get() as any).s);
  const jStamp = String((db.prepare(`SELECT COUNT(*) || ':' || COALESCE(MAX(updated_at), '') s FROM jobs`).get() as any).s);
  const runs = db.prepare(`SELECT id, agent, job_id, status, model, started_at, ended_at, duration_ms, cost_usd, summary, error
    FROM runs WHERE status = 'running' OR ended_at >= datetime('now', '-5 seconds') ORDER BY id DESC LIMIT 20`).all();
  const payload: any = {};
  if (events.length) payload.events = events;
  if ((runs as any[]).length) payload.runs = runs;
  if (qStamp !== cursor.queue) { cursor.queue = qStamp; payload.queueChanged = true; }
  if (jStamp !== cursor.job) { cursor.job = jStamp; payload.jobsChanged = true; }
  if (!Object.keys(payload).length) return;
  const msg = `data: ${cleanBrand(payload)}\n\n`;
  for (const c of clients) c.write(msg);
}

function serveFile(res: ServerResponse, path: string) {
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
}

type Handler = (req: IncomingMessage, res: ServerResponse, m: RegExpMatchArray, url: URL) => unknown;
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/today$/, () => today()],
  ['GET', /^\/api\/jobs$/, (_q, _r, _m, url) => {
    const p = url.searchParams;
    const where: string[] = []; const args: any[] = [];
    const status = p.get('status');
    if (status) { const s = status.split(','); where.push(`status IN (${s.map(() => '?').join(',')})`); args.push(...s); }
    else where.push(`status NOT IN ('filtered')`);
    if (p.get('q')) { where.push('(company LIKE ? OR title LIKE ?)'); args.push(`%${p.get('q')}%`, `%${p.get('q')}%`); }
    // Jobs an agent is working on, or that wait on you, stay visible even before their new score lands.
    if (p.get('minFit')) { where.push(`(fit_score >= ? OR status IN ('evaluating','tailoring','awaiting-approval','approved'))`); args.push(Number(p.get('minFit'))); }
    if (p.get('platform')) { where.push('sources LIKE ?'); args.push(`%"${p.get('platform')}%`); }
    if (p.get('company')) { where.push('company LIKE ?'); args.push(`%${p.get('company')}%`); }
    const warm = warmCounts();
    return db.prepare(`SELECT id, company, title, location, remote, status, fit_score, fit, source, sources, first_seen, updated_at, apply_url,
      salary_min, salary_max, currency, report_num, score5, decision, confidence, legitimacy, archetype, summary, triage, engine_status FROM jobs WHERE ${where.join(' AND ')} ORDER BY fit_score DESC NULLS LAST, first_seen DESC LIMIT 1000`).all(...args)
      .map((j: any) => {
        return { ...decorate(j), warm: warm.get(normCompany(j.company)) ?? 0 };
      });
  }],
  ['GET', /^\/api\/jobs\/([\w-]+)$/, (_q, _r, m) => jobDetail(m[1])],
  ['POST', /^\/api\/jobs\/([\w-]+)\/status$/, async (req, _r, m) => {
    const { status, note } = await readBody(req);
    if (!STAGES.includes(status)) throw new Error(`unknown status ${status}`);
    setJobStatus(m[1], status, note);
    return { ok: true };
  }],
  ['POST', /^\/api\/jobs\/([\w-]+)\/tailor$/, async (req, _r, m) => {
    const notes = String((await readBody(req)).notes ?? '').trim().slice(0, 600);
    return startPipeline('tailor', notes ? [m[1], '--notes', notes] : [m[1]], `tailor:${m[1]}`);
  }],
  ['POST', /^\/api\/jobs\/([\w-]+)\/evaluate$/, async (req, _r, m) => {
    const answer = String((await readBody(req)).answer ?? '').trim().slice(0, 300);
    return startPipeline('evaluate', answer ? [m[1], '--answer', answer] : [m[1]], `evaluate:${m[1]}`);
  }],
  ['GET', /^\/api\/engine$/, async () => {
    const doctor = await engineScript('doctor.mjs', ['--json'], { timeoutMs: 60_000 });
    const update = kvGet('engine_update');
    return { doctor: doctor.json ?? null, update: update ? JSON.parse(update) : null, version: readIf(join(ROOT, 'engine/career-ops/VERSION'))?.split(/\s/)[0] ?? null };
  }],
  ['POST', /^\/api\/engine\/(update-check|update|verify)$/, async (_q, _r, m) => {
    const args = m[1] === 'update-check' ? ['update-system.mjs', ['check', '--force']] : m[1] === 'update' ? ['update-system.mjs', ['apply', '--confirm']] : ['verify-pipeline.mjs', []];
    const r = await engineScript(args[0] as string, args[1] as string[], { timeoutMs: 600_000 });
    if (m[1] === 'update-check' && r.json) kvSet('engine_update', JSON.stringify({ ...r.json, checkedAt: new Date().toISOString() }));
    return { code: r.code, result: r.json ?? (r.stdout.trim().split('\n').slice(-25).join('\n') || r.stderr.trim().slice(-2000)) };
  }],
  ['POST', /^\/api\/jobs\/([\w-]+)\/kit$/, (_q, _r, m) => startPipeline('skill', ['application-kit', m[1]], `kit:${m[1]}`)],
  ['POST', /^\/api\/jobs\/([\w-]+)\/referral$/, async (req, _r, m) => {
    const { contactId } = await readBody(req);
    const c = db.prepare('SELECT name FROM contacts WHERE id = ?').get(Number(contactId)) as any;
    if (!c) throw new Error('no such contact');
    return startPipeline('skill', ['referral-request', m[1], c.name], `referral:${m[1]}:${contactId}`);
  }],
  ['POST', /^\/api\/company-search$/, async (req) => {
    const name = String((await readBody(req)).name ?? '').trim().slice(0, 80);
    if (name.length < 2) throw new Error('type a company name');
    return { ...startPipeline('company', [name], `company:${name.toLowerCase()}`), name };
  }],
  ['POST', /^\/api\/companies\/research$/, async (req) => {
    const name = String((await readBody(req)).name ?? '').trim().slice(0, 80);
    return startPipeline('skill', ['company-research', name], `research:${name.toLowerCase()}`);
  }],
  ['GET', /^\/api\/companies$/, (_q, _r, _m, url) => companies(url.searchParams.get('q') ?? '')],
  ['GET', /^\/api\/companies\/(.+)$/, (_q, _r, m) => companyDetail(decodeURIComponent(m[1]))],
  ['POST', /^\/api\/contacts\/import$/, async (req) => importConnections(String((await readBody(req)).csv ?? ''))],
  ['GET', /^\/api\/alerts$/, () => {
    const cfg = loadSearch();
    return { ...cfg.alerts, topic: ntfyTopic(), fastlane: cfg.fastlane, inbox: cfg.inbox };
  }],
  ['POST', /^\/api\/alerts\/test$/, async () => ({ ok: await push('GiggleGig', 'Test alert — matches and ready resumes will arrive here.', { tags: ['white_check_mark'] }) })],
  ['POST', /^\/api\/tailor$/, async (req) => {
    const ids: string[] = ((await readBody(req)).ids ?? []).filter((id: unknown) => typeof id === 'string' && /^[\w-]+$/.test(id));
    if (!ids.length) throw new Error('no jobs selected');
    return startPipeline('tailor', ids);
  }],
  ['GET', /^\/api\/stages$/, () => ({ stages: STAGES, counts: pipelineCounts() })],
  ['GET', /^\/api\/queue$/, (_q, _r, _m, url) => (db.prepare(`SELECT q.*, j.company FROM queue q LEFT JOIN jobs j ON j.id = q.job_id
      WHERE q.status = ? ORDER BY q.id DESC LIMIT 200`).all(url.searchParams.get('status') ?? 'pending') as any[]).map(parseQueue)],
  ['GET', /^\/api\/queue\/(\d+)$/, (_q, _r, m) => {
    const item = parseQueue(db.prepare(`SELECT q.*, j.company, j.title AS job_title, j.fit_score, j.status AS job_status
      FROM queue q LEFT JOIN jobs j ON j.id = q.job_id WHERE q.id = ?`).get(Number(m[1])));
    if (!item) throw new Error('no such queue item');
    const contact = item.contact_id ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(item.contact_id) : null;
    return { ...item, contact, job: item.job_id ? jobDetail(item.job_id) : null };
  }],
  ['POST', /^\/api\/queue\/(\d+)\/edit$/, async (req, _r, m) => {
    const item = parseQueue(db.prepare('SELECT * FROM queue WHERE id = ?').get(Number(m[1])));
    if (!item) throw new Error('no such queue item');
    const body = { ...item.body, ...(await readBody(req)).edits };
    db.prepare('UPDATE queue SET body = ? WHERE id = ?').run(JSON.stringify(body), item.id);
    return { ok: true };
  }],
  ['POST', /^\/api\/queue\/(\d+)\/(approve|reject|done)$/, async (req, _r, m) => decide(Number(m[1]), m[2], (await readBody(req)).edits)],
  ['GET', /^\/api\/runs$/, (_q, _r, _m, url) => db.prepare(`SELECT r.*, j.company FROM runs r LEFT JOIN jobs j ON j.id = r.job_id
      ORDER BY r.id DESC LIMIT ?`).all(Number(url.searchParams.get('limit') ?? 100))],
  ['GET', /^\/api\/runs\/(\d+)$/, (_q, _r, m) => ({
    ...(db.prepare('SELECT * FROM runs WHERE id = ?').get(Number(m[1])) as object),
    events: db.prepare('SELECT id, ts, type, text FROM events WHERE run_id = ? ORDER BY id').all(Number(m[1])),
  })],
  ['POST', /^\/api\/run\/(briefing|scout|score|triage|tailor|calendar|fastlane|inbox)$/, (_q, _r, m) => startPipeline(m[1])],
  ['POST', /^\/api\/onboarding\/resume$/, async (req) => {
    const body = await readBody(req);
    if (body.replaceCandidate !== true) throw new Error('Confirm that this resume replaces the current candidate profile and clears its job history.');
    if (running.has('setup-context')) throw new Error('Resume intake is already running. Wait for it to finish before starting another.');
    const filename = String(body.filename ?? '').toLowerCase();
    const encoded = String(body.data ?? '');
    const ext = extname(filename);
    if (!['.pdf', '.docx', '.txt', '.md'].includes(ext)) throw new Error('Upload a PDF, DOCX, TXT, or Markdown resume.');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Resume upload is malformed.');
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('Resume must be between 1 byte and 5 MB.');
    if (ext === '.pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('This file is not a valid PDF.');
    if (ext === '.docx' && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error('This file is not a valid DOCX archive.');
    const inbox = join(ENGINE_DATA, 'inbox');
    mkdirSync(inbox, { recursive: true });
    const saved = join(inbox, `${randomBytes(16).toString('hex')}${ext}`);
    let resumeText: string | null = null;
    if (ext === '.docx') {
      const pending = join(inbox, `${randomBytes(16).toString('hex')}.zip`);
      try {
        writeFileSync(pending, bytes, { mode: 0o600, flag: 'wx' });
        const entries = execFileSync('unzip', ['-Z1', pending], { encoding: 'utf8', timeout: 5000, maxBuffer: 256 * 1024 });
        const names = entries.split('\n');
        if (!names.includes('[Content_Types].xml') || !names.includes('word/document.xml')) throw new Error('DOCX archive is missing its document parts.');
        resumeText = execFileSync(process.env.PYTHON_BIN ?? 'python3', [join(ROOT, 'os/extract_docx.py'), pending], { encoding: 'utf8', timeout: 8000, maxBuffer: 2 * 1024 * 1024 });
        if (!resumeText.trim()) throw new Error('No readable text was found in this DOCX.');
      } catch (error: any) {
        const detail = String(error.message ?? '');
        throw new Error(detail.includes('missing its document parts') || detail.includes('No readable text') || detail.includes('too large') || detail.includes('too many')
          ? detail : 'Could not validate or extract text from this DOCX file.');
      } finally { rmSync(pending, { force: true }); }
    }
    // Nothing from the previous candidate may keep running into the new workspace.
    stopAll();
    await new Promise((done) => setTimeout(done, 800));
    setCandidateState('intake');
    resetCandidateWorkspace();
    mkdirSync(inbox, { recursive: true });
    writeFileSync(saved, bytes, { mode: 0o600, flag: 'wx' });
    const upload = resumeText ? saved.replace(/\.docx$/, '.txt') : saved;
    if (resumeText) writeFileSync(upload, resumeText, { mode: 0o600, flag: 'wx' });
    return { ...startPipeline('intake', [upload], 'setup-context'), filename: ext };
  }],
  ['GET', /^\/api\/running$/, () => [...running.keys()]],
  ['GET', /^\/api\/candidate$/, () => candidateState()],
  ['POST', /^\/api\/runs\/(\d+)\/stop$/, (_q, _r, m) => stopRun(Number(m[1]))],
  ['POST', /^\/api\/stop$/, () => stopAll()],
  ['GET', /^\/api\/contacts$/, () => db.prepare('SELECT * FROM contacts ORDER BY company, relationship').all()],
  ['GET', /^\/api\/interviews$/, () => ({
    upcoming: db.prepare(`SELECT i.*, j.company, j.title FROM interviews i LEFT JOIN jobs j ON j.id = i.job_id
      WHERE scheduled_at IS NOT NULL ORDER BY scheduled_at DESC LIMIT 50`).all(),
    weakSpots: weakSpots(),
  })],
  ['GET', /^\/api\/sources$/, () => sourcesReport()],
  ['POST', /^\/api\/settings$/, async (req) => {
    const b = await readBody(req);
    const cfg = saveSearch((c) => {
      if (b.automation) c.automation = { ...c.automation, ...b.automation };
      if (b.source) {
        const { key, enabled } = b.source;
        if (key === 'jobspy' || key === 'gmailAlerts' || key === 'webSearch') (c.sources as any)[key].enabled = enabled;
        else if (key === 'apis') { c.sources.apis.jsearch = enabled; c.sources.apis.adzuna = enabled; c.sources.apis.jooble = enabled; }
        else if (key in c.sources) (c.sources as any)[key] = enabled;
      }
      if (b.jobspySites) c.sources.jobspy.sites = b.jobspySites;
      if (b.alerts) c.alerts = { ...c.alerts, ...b.alerts };
      if (b.fastlane) c.fastlane = { ...c.fastlane, ...b.fastlane };
      if (b.inbox) c.inbox = { ...c.inbox, ...b.inbox };
    });
    return { automation: cfg.automation, sources: cfg.sources, alerts: cfg.alerts, fastlane: cfg.fastlane, inbox: cfg.inbox };
  }],
  ['POST', /^\/api\/run\/scout\/(ats|jobspy|apis|jsearch|adzuna|jooble|remoteok|remotive|hackernews|gmail|web)$/, (_q, _r, m) => startPipeline('scout', [m[1]], `scout:${m[1]}`)],
  ['GET', /^\/api\/config$/, () => ({ search: loadSearch(), lanUrl: lanUrl(), profile: profile(), candidate: candidateState() })],
];

/** Name + target line for the desk masthead, from the base resume. */
function profile() {
  const base = readIf(join(ROOT, 'context/base-resume.json'));
  const r = base ? JSON.parse(base) : {};
  return { name: r.name ?? 'Your candidate' };
}

function lanUrl(port = Number(process.env.DESK_PORT ?? 4321)) {
  const ip = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  return ip ? `http://${ip}:${port}/?t=${token()}` : null;
}

export function serve(port = 4321) {
  process.env.DESK_PORT = String(port);
  initCursor();
  setInterval(tick, 1000);
  setInterval(reap, 10_000);
  // Reports and status moves made outside the desk show up here within half a minute.
  try { syncFromTracker(); } catch { /* tracker not created yet */ }
  setInterval(() => { try { syncFromTracker(); } catch { /* ignore */ } }, 30_000);
  const dist = join(DESK_DIR, 'dist');

  createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://desk');
    if (!authorized(req, url)) {
      res.writeHead(401, { 'content-type': 'text/plain' });
      return res.end('Open the LAN link printed by `npm run desk` once on this device.');
    }
    // Localhost needs no token, so any web page could otherwise POST here from the browser (and wipe the workspace).
    if (req.method === 'POST' && req.headers.origin) {
      const from = new URL(req.headers.origin).host;
      if (from !== req.headers.host && from !== 'localhost:5173') {
        res.writeHead(403, { 'content-type': 'text/plain' });
        return res.end('Cross-site request refused.');
      }
    }
    if (url.searchParams.get('t') === token()) {
      res.setHeader('set-cookie', `desk=${token()}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
    }

    if (url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // Read-only access to the engine's CVs, reports and JD captures.
    if (url.pathname.startsWith('/files/engine/')) {
      const rel = decodeURIComponent(url.pathname.slice('/files/engine/'.length));
      const path = normalize(join(ENGINE_DATA, rel));
      const okDir = ['output', 'reports', 'jds', 'interview-prep'].some((d) => path.startsWith(join(ENGINE_DATA, d) + '/'));
      if (!okDir || !existsSync(path) || statSync(path).isDirectory()) return json(res, { error: 'not found' }, 404);
      return serveFile(res, path);
    }

    // Read-only access to generated artifacts (resume PDFs, prep docs).
    if (url.pathname.startsWith('/files/')) {
      const path = normalize(join(OUTPUT_DIR, decodeURIComponent(url.pathname.slice('/files/'.length))));
      if (!path.startsWith(OUTPUT_DIR) || !existsSync(path) || statSync(path).isDirectory()) return json(res, { error: 'not found' }, 404);
      return serveFile(res, path);
    }

    for (const [method, re, handler] of routes) {
      const m = url.pathname.match(re);
      if (m && req.method === method) {
        try { return json(res, await handler(req, res, m, url)); }
        catch (e: any) { return json(res, { error: e.message ?? String(e) }, 400); }
      }
    }
    if (url.pathname.startsWith('/api/')) return json(res, { error: 'not found' }, 404);

    // The built desk (SPA fallback to index.html).
    if (!existsSync(dist)) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      return res.end('Desk not built yet: cd desk && npm install && npm run build');
    }
    const file = resolve(dist, '.' + url.pathname);
    if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) return serveFile(res, file);
    return serveFile(res, join(dist, 'index.html'));
  }).listen(port, '0.0.0.0', () => {
    console.log(`Desk:  http://localhost:${port}`);
    const lan = lanUrl(port);
    if (lan) console.log(`Phone: ${lan}   (open once on your phone; same Wi-Fi)`);
  });
}
