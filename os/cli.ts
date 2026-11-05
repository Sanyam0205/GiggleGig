import { readFileSync } from 'node:fs';
import { candidateState, db, setJobStatus } from './db.ts';
import { scout } from './pipeline/scout.ts';
import { score } from './pipeline/score.ts';
import { promoteDue, tailor } from './pipeline/tailor.ts';
import { syncInterviews } from './pipeline/calendar.ts';
import { engineScore } from './engine/index.ts';
import { housekeeping, syncFromTracker } from './engine/sync.ts';
import {
  addContact, addManualJob, addQueue, findJobs, getJob, markTailored, pipelineCounts, retro, saveFit, STAGES, weakSpots, writeJd,
} from './store.ts';

const [cmd, ...args] = process.argv.slice(2);

/** Silent release check (AGENTS.md "Update Check"); applying an update is always your call on the desk. */
async function engineCheckUpdate() {
  const { engineScript } = await import('./engine/run.ts');
  const r = await engineScript('update-system.mjs', ['check'], { timeoutMs: 60_000 });
  const { kvSet } = await import('./db.ts');
  if (r.json) kvSet('engine_update', JSON.stringify({ ...r.json, checkedAt: new Date().toISOString() }));
}
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const has = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && Boolean(args.splice(i, 1));
};
const print = (v: unknown) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const readJsonArg = (v: string) => JSON.parse(v.trim().startsWith('{') || v.trim().startsWith('[') ? v : readFileSync(v, 'utf8'));

const commands: Record<string, { help: string; run: () => unknown | Promise<unknown> }> = {
  // ── pipeline ────────────────────────────────────────────────────────────
  briefing: {
    help: 'briefing — the daily run: scout → score → tailor → calendar + prep → due follow-ups',
    run: async () => {
      // One failed step must not cost the rest of the morning: interviews and inbox still run if scoring breaks.
      const failed: string[] = [];
      const step = async (name: string, fn: () => unknown) => {
        try { await fn(); } catch (e: any) { failed.push(`${name}: ${e.message ?? e}`); console.error(`${name} failed: ${e.message ?? e}`); }
      };
      await step('update check', engineCheckUpdate);
      await step('search', async () => (await import('./pipeline/search.ts')).search());
      await step('tailor', () => tailor());
      await step('tracker sync', syncFromTracker);
      await step('housekeeping', housekeeping);
      await step('calendar', syncInterviews);
      await step('inbox', async () => (await import('./pipeline/inbox.ts')).watchInbox());
      return { followUpsDue: promoteDue(), failed };
    },
  },
  calendar: { help: 'calendar — find interviews on Google Calendar and prep the next 48 h', run: () => syncInterviews() },
  followups: { help: 'followups — release scheduled follow-ups that are due', run: () => ({ released: promoteDue() }) },
  schedule: {
    help: 'schedule install|uninstall|status — launchd jobs: 07:00 briefing, scout every 4 h, desk always on',
    run: async () => (await import('./schedule.ts')).schedule(args[0] ?? 'status'),
  },
  stats: { help: 'stats — jobs by status', run: () => pipelineCounts() },
  scout: {
    help: 'scout [ats jobspy jsearch adzuna jooble startups remoteok remotive hackernews gmail web] [--score] — find roles; --score also triages them',
    run: async () => {
      if (has('score')) return (await import('./pipeline/search.ts')).search(args);
      return scout(args);
    },
  },
  score: { help: 'score [evaluate-limit] — career-ops triage, then full A–G evaluation of what passes', run: () => engineScore(args[0] ? Number(args[0]) : undefined) },
  'score-legacy': { help: 'score-legacy [limit] — the old 0–100 scorer', run: () => score(args[0] ? Number(args[0]) : undefined) },
  triage: { help: 'triage [limit] — career-ops first-pass triage only', run: async () => (await import('./engine/triage.ts')).triage(args[0] ? Number(args[0]) : undefined) },
  evaluate: { help: 'evaluate <job-id …> [--answer "<agency confirmation>"] | --pending [n] — full A–G evaluation', run: async () => {
    const ev = await import('./engine/evaluate.ts');
    const answer = flag('answer');
    if (args[0] === '--pending') return ev.evaluatePending(Number(args[1] ?? 6));
    return ev.evaluatePending(args.length, args, answer);
  } },
  engine: {
    help: 'engine doctor|verify|sync|portals|update-check|update|rollback|script <name.mjs> [args] — career-ops engine tools',
    run: async () => {
      const { engineScript } = await import('./engine/run.ts');
      const [sub, ...rest] = args;
      const show = (r: any) => r.json ?? (r.stdout.trim() || r.stderr.trim());
      if (sub === 'doctor') return show(await engineScript('doctor.mjs', ['--json']));
      if (sub === 'verify') return show(await engineScript('verify-pipeline.mjs'));
      if (sub === 'sync') return syncFromTracker();
      if (sub === 'portals') return (await import('./engine/portals.ts')).syncPortals();
      if (sub === 'update-check') return show(await engineScript('update-system.mjs', ['check', '--force']));
      if (sub === 'update') return show(await engineScript('update-system.mjs', ['apply', '--confirm'], { timeoutMs: 600_000 }));
      if (sub === 'rollback') return show(await engineScript('update-system.mjs', ['rollback']));
      if (sub === 'script') return show(await engineScript(rest[0], rest.slice(1)));
      throw new Error('engine doctor|verify|sync|portals|update-check|update|rollback|script');
    },
  },
  mode: {
    help: 'mode <career-ops mode> [args…] [--model sonnet] — run any career-ops mode unattended (deep, patterns, followup, upskill, titles…)',
    run: async () => {
      const { engineAgent } = await import('./engine/run.ts');
      const { routeFor } = await import('./agent.ts');
      const model = flag('model');
      const role = { agent: `mode:${args[0]}`, role: 'mode', model };
      // Slash commands are Claude Code's; the engine's AGENTS.md routes the same request by name under Codex.
      const prompt = routeFor(role).provider === 'codex' ? `Run the career-ops mode "${args[0]}" (modes/${args[0]}.md)${args.length > 1 ? ` with: ${args.slice(1).join(' ')}` : ''}.` : `/career-ops ${args.join(' ')}`;
      const r = await engineAgent({ ...role, maxTurns: 60, prompt });
      return { ok: r.ok, error: r.error, summary: r.text.slice(-1500) };
    },
  },
  tailor: {
    help: 'tailor [job-id ...] [--notes "emphasize the LLM work"] — default: top shortlisted (auto mode only)',
    run: () => { const notes = flag('notes'); return tailor(args, notes); },
  },
  'render-base': {
    help: 'render-base — preview context/base-resume.json as output/base/resume.pdf',
    run: async () => {
      const { mkdirSync, copyFileSync } = await import('node:fs');
      const { renderResume } = await import('./render.ts');
      mkdirSync('output/base', { recursive: true });
      copyFileSync('context/base-resume.json', 'output/base/resume.json');
      return renderResume('output/base/resume.json');
    },
  },
  fastlane: { help: 'fastlane — light scout for postings from the last few hours, scored and alerted', run: async () => (await import('./pipeline/fastlane.ts')).fastlane() },
  inbox: { help: 'inbox — read hiring emails (OAs, interviews, replies, rejections) and update the pipeline', run: async () => (await import('./pipeline/inbox.ts')).watchInbox() },
  watch: {
    help: 'watch — every-30-minutes job: inbox watcher + due follow-ups',
    run: async () => ({ inbox: await (await import('./pipeline/inbox.ts')).watchInbox(), followUps: promoteDue() }),
  },
  'restore-profile': {
    help: 'restore-profile [archive-folder] — put back the profile a resume upload archived (newest by default)',
    run: async () => {
      const r = (await import('./reset.ts')).restoreCandidate(args[0]);
      const { setCandidateState } = await import('./db.ts');
      setCandidateState('ready');
      return r;
    },
  },
  intake: {
    help: 'intake <resume file> — build the candidate profile from a resume, then start the search for it',
    run: async () => (await import('./pipeline/intake.ts')).intake(args[0]),
  },
  company: { help: 'company "<name>" — find and score every feasible role at one company', run: async () => (await import('./pipeline/company.ts')).searchCompany(args.join(' ')) },
  contacts: {
    help: 'contacts import <Connections.csv> | contacts warm "<company>"',
    run: async () => {
      const c = await import('./contacts.ts');
      if (args[0] === 'import') return c.importConnections(readFileSync(args[1], 'utf8'));
      if (args[0] === 'warm') return c.warmPaths(args.slice(1).join(' '));
      throw new Error('contacts import|warm');
    },
  },
  skill: {
    help: 'skill <name> [args…] [--model sonnet] — run any project skill unattended (used by desk buttons)',
    run: async () => {
      const model = flag('model');
      const [name, ...rest] = args;
      const { runSkill } = await import('./pipeline/tailor.ts');
      const r = await runSkill(name, rest.join(' '), { model, jobId: /^[0-9a-f]{12}$/.test(rest[0] ?? '') ? rest[0] : undefined });
      return { ok: r.ok, error: r.error, summary: r.text.slice(0, 800) };
    },
  },
  notify: {
    help: 'notify test — send a test phone alert and print the ntfy topic',
    run: async () => {
      const n = await import('./notify.ts');
      const ok = await n.push('GiggleGig', 'Alerts are working. Matches and ready resumes will arrive here.', { tags: ['white_check_mark'] });
      return { ok, topic: n.ntfyTopic(), subscribe: `ntfy app → + → topic "${n.ntfyTopic()}" (server ntfy.sh)` };
    },
  },
  serve: {
    help: 'serve [--port 4321] — start the desk',
    run: async () => (await import('./server.ts')).serve(Number(flag('port') ?? 4321)),
  },

  // ── jobs (used by skills) ───────────────────────────────────────────────
  job: {
    help: 'job <id> — print job JSON and write output/jobs/<id>/jd.md',
    run: () => { const j = getJob(args[0]); writeJd(j); return { ...j, description: j.description?.slice(0, 400) + '…', jd: `output/jobs/${j.id}/jd.md` }; },
  },
  find: { help: 'find [text] [--status a,b]', run: () => findJobs(args.join(' '), flag('status')?.split(',')) },
  add: {
    help: 'add <url> <jd-file> [company] [title] — add a job you found yourself',
    run: () => { const id = addManualJob(args[0], readFileSync(args[1], 'utf8'), args[2], args[3]); writeJd(getJob(id)); return { id }; },
  },
  fit: { help: "fit <id> '<json>' — save a fit score", run: () => { saveFit(args[0], readJsonArg(args[1])); return 'saved'; } },
  status: {
    help: `status <id> <${STAGES.join('|')}> [note]`,
    run: () => {
      if (!STAGES.includes(args[1] as any)) throw new Error(`unknown status ${args[1]}`);
      setJobStatus(args[0], args[1], args.slice(2).join(' ') || undefined);
      return `${args[0]} → ${args[1]}`;
    },
  },
  kit: {
    help: 'kit <id> — attach output/jobs/<id>/application.json to the application slip',
    run: () => {
      const path = `output/jobs/${args[0]}/application.json`;
      const kit = JSON.parse(readFileSync(path, 'utf8'));
      const q = db.prepare(`SELECT id, body FROM queue WHERE kind = 'application' AND job_id = ? AND status IN ('pending','approved') ORDER BY id DESC LIMIT 1`).get(args[0]) as any;
      if (!q) return { saved: path, note: 'no open application slip yet; the kit attaches when the resume is tailored' };
      db.prepare('UPDATE queue SET body = ? WHERE id = ?').run(JSON.stringify({ ...JSON.parse(q.body), kit }), q.id);
      return { attached: q.id, fields: kit.fields?.length ?? 0 };
    },
  },
  'queue-done': {
    help: 'queue-done <job-id> — close the open application slip as applied',
    run: () => {
      const r = db.prepare(`UPDATE queue SET status = 'done', decided_at = datetime('now') WHERE kind = 'application' AND job_id = ? AND status IN ('pending','approved')`).run(args[0]);
      return { closed: Number(r.changes) };
    },
  },
  render: {
    help: 'render <id> — render output/jobs/<id>/resume.json to html/md/pdf and report pages (no queueing)',
    run: async () => (await import('./render.ts')).renderResume(`output/jobs/${args[0]}/resume.json`),
  },
  tailored: { help: 'tailored <id> — final render, then queue (or refresh) the application slip', run: () => markTailored(args[0]) },
  pipeline: {
    help: 'pipeline — counts by stage, due items, upcoming interviews',
    run: () => ({
      stages: pipelineCounts(),
      pendingApprovals: db.prepare(`SELECT kind, COUNT(*) n FROM queue WHERE status = 'pending' GROUP BY kind`).all(),
      scheduled: db.prepare(`SELECT id, kind, title, due_at FROM queue WHERE status = 'scheduled' ORDER BY due_at LIMIT 20`).all(),
      upcomingInterviews: db.prepare(`SELECT i.*, j.company, j.title FROM interviews i JOIN jobs j ON j.id = i.job_id
        WHERE scheduled_at >= datetime('now') ORDER BY scheduled_at`).all(),
    }),
  },
  keywords: {
    help: 'keywords [--status a,b] [--limit 30] — aggregated JD keywords',
    run: () => {
      const statuses = (flag('status') ?? 'shortlisted,awaiting-approval,applied').split(',');
      const rows = db.prepare(`SELECT fit FROM jobs WHERE fit IS NOT NULL AND status IN (${statuses.map(() => '?').join(',')})
        ORDER BY updated_at DESC LIMIT ?`).all(...statuses, Number(flag('limit') ?? 30)) as any[];
      const counts: Record<string, number> = {};
      for (const r of rows) for (const k of JSON.parse(r.fit).keywords ?? []) counts[k.toLowerCase()] = (counts[k.toLowerCase()] ?? 0) + 1;
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40);
    },
  },

  // ── approval queue ──────────────────────────────────────────────────────
  queue: {
    help: 'queue <kind> <job-id|-> "<title>" <json-file|json> [--due ISO] [--contact id]',
    run: () => {
      const [kind, jobId, title, body] = args;
      const due = flag('due');
      const contact = flag('contact');
      return { queued: addQueue(kind, jobId === '-' ? null : jobId, title, readJsonArg(body), { dueAt: due, contactId: contact ? Number(contact) : undefined }) };
    },
  },

  // ── contacts ────────────────────────────────────────────────────────────
  contact: {
    help: 'contact add <company> <name> [role] [linkedin] [email] [relationship] | contact list [company] | contact set <id> <relationship>',
    run: () => {
      const [sub, ...rest] = args;
      if (sub === 'add') return { id: addContact(rest[0], rest[1], rest[2], rest[3], rest[4], rest[5]) };
      if (sub === 'set') {
        db.prepare(`UPDATE contacts SET relationship = ?, last_contact_at = datetime('now') WHERE id = ?`).run(rest[1], Number(rest[0]));
        return 'updated';
      }
      return rest[0]
        ? db.prepare('SELECT * FROM contacts WHERE company LIKE ? ORDER BY relationship').all(`%${rest[0]}%`)
        : db.prepare('SELECT company, COUNT(*) n, SUM(relationship IN (\'warm\',\'referrer\')) warm FROM contacts GROUP BY company').all();
    },
  },

  // ── interviews ──────────────────────────────────────────────────────────
  interview: {
    help: "interview add <job-id> <round> <ISO datetime> [prep-path] | interview grades <job-id|-> <round> '<json>'",
    run: () => {
      const [sub, jobId, round, x, y] = args;
      const job = jobId === '-' ? null : jobId;
      if (sub === 'add') {
        const { lastInsertRowid } = db.prepare('INSERT INTO interviews (job_id, round, scheduled_at, prep_path) VALUES (?, ?, ?, ?)')
          .run(job, round, x ?? null, y ?? null);
        return { id: Number(lastInsertRowid) };
      }
      if (sub === 'grades') {
        const parsed = readJsonArg(x);
        const grades = Array.isArray(parsed) ? parsed : parsed.grades;
        db.prepare('INSERT INTO interviews (job_id, round, scores) VALUES (?, ?, ?)').run(job, round, JSON.stringify(grades));
        return { saved: grades.length };
      }
      throw new Error('interview add|grades');
    },
  },
  interviews: {
    help: 'interviews [--weak] — history, or weakest question types',
    run: () => (has('weak') ? weakSpots() : db.prepare(`SELECT i.id, i.round, i.scheduled_at, j.company FROM interviews i
      LEFT JOIN jobs j ON j.id = i.job_id ORDER BY i.created_at DESC LIMIT 30`).all()),
  },
  retro: {
    help: 'retro [YYYY-MM-DD week start, default: last Monday]',
    run: () => {
      const d = new Date();
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return retro(args[0] ?? d.toISOString().slice(0, 10));
    },
  },
};

// Nothing searches, scores or tailors while there is no finished candidate profile to measure it against.
const NEEDS_CANDIDATE = new Set(['briefing', 'scout', 'score', 'score-legacy', 'triage', 'evaluate', 'tailor', 'fastlane', 'company', 'mode', 'calendar', 'inbox', 'watch']);
const entry = commands[cmd];
const candidate = candidateState();
if (entry && NEEDS_CANDIDATE.has(cmd) && candidate.state !== 'ready') {
  console.log(candidate.state === 'none' ? `${cmd} skipped: no candidate yet. Upload a resume on the desk (Agents).`
    : candidate.state === 'intake' ? `${cmd} skipped: resume intake is still running`
      : `${cmd} skipped: resume intake failed (${candidate.error ?? 'see the desk'}). Upload the resume again.`);
  process.exit(0);
}
if (!entry) {
  console.log('usage: node os/cli.ts <command>\n\n' + Object.values(commands).map((c) => '  ' + c.help).join('\n'));
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(entry.run()).then((r) => { if (r !== undefined && cmd !== 'serve') print(r); }).catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
