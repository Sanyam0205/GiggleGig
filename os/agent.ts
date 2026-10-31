// Headless agent runner. Each role in config/search.json `agents.routes` picks a provider (Claude Code or Codex);
// everything above this file only names a role and the tools it may use.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { loadSearch, type AgentRoute } from './config.ts';
import { db } from './db.ts';
import { findClaude, findCodex, ROOT } from './paths.ts';

export interface AgentOptions {
  agent: string;                 // label shown on the desk
  role?: string;                 // key in agents.routes; defaults to the label
  prompt: string;
  model?: string;                // explicit override (a CLI --model); wins over the route
  jobId?: string;
  schema?: object;               // JSON Schema → structured output
  tools?: string[];              // allowlist; defaults to read-only file tools
  disallow?: string[];
  maxTurns?: number;
  appendSystem?: string;
  appendSystemFile?: string;     // e.g. the engine's batch/batch-prompt.md (kept byte-identical so it prompt-caches)
  cwd?: string;                  // run inside another project (the engine) so its AGENTS.md applies
  env?: Record<string, string>;
  strictMcp?: boolean;           // start with no MCP servers (engine workers need none; saves tokens)
  writableDirs?: string[];       // Codex sandbox: writable directories beyond cwd
  timeoutMs?: number;
}

export interface AgentResult<T = unknown> {
  runId: number;
  ok: boolean;
  text: string;
  data?: T;
  costUsd?: number;
  error?: string;
}

const GMAIL = 'mcp__claude_ai_Gmail__';
const GCAL = 'mcp__claude_ai_Google_Calendar__';

/** Read + draft only. Grant these instead of a whole connector so new connector tools are never allowed by default. */
export const GMAIL_READ = ['search_threads', 'get_thread', 'get_message', 'list_labels', 'list_drafts', 'get_draft'].map((t) => GMAIL + t);
export const GMAIL_DRAFT = [...GMAIL_READ, GMAIL + 'create_draft', GMAIL + 'update_draft'];
export const CALENDAR_READ = ['list_events', 'search_events', 'get_event', 'list_calendars'].map((t) => GCAL + t);

// Agents never send, delete or change anything on your behalf: drafts only, and only you approve.
const ALWAYS_DENY = [
  'Bash(git push:*)',
  ...['send_message', 'reply', 'forward', 'delete_draft', 'trash_message', 'trash_thread', 'mark_message_spam', 'mark_thread_spam',
    'label_message', 'label_thread', 'unlabel_message', 'unlabel_thread', 'update_message_labels', 'create_label', 'update_label',
    'delete_label', 'apply_sensitive_message_label', 'apply_sensitive_thread_label'].map((t) => GMAIL + t),
  ...['create_event', 'update_event', 'delete_event', 'respond_to_event'].map((t) => GCAL + t),
];

const DEFAULT_TOOLS = ['Read', 'Glob', 'Grep'];
const CLAUDE_MODELS = /^(haiku|sonnet|opus|fable|claude)/;
const needsConnectors = (tools: string[]) => tools.some((t) => t.startsWith('mcp__'));

function logEvent(runId: number, type: string, text: string) {
  const clipped = text.length > 4000 ? text.slice(0, 4000) + '…' : text;
  db.prepare('INSERT INTO events (run_id, type, text) VALUES (?, ?, ?)').run(runId, type, clipped);
}

function describeTool(name: string, input: Record<string, unknown>): string {
  const short = name.replace(/^mcp__claude_ai_/, '').replace(/__/g, '.');
  const arg = input.file_path ?? input.pattern ?? input.query ?? input.url ?? input.prompt ?? input.description ?? input.q;
  return arg ? `${short} · ${String(arg).slice(0, 160)}` : short;
}

/** The route for a run. Gmail and Calendar are Claude connectors, so a role that needs them always runs on Claude. */
export function routeFor(opts: Pick<AgentOptions, 'agent' | 'role' | 'model' | 'tools'>): AgentRoute {
  const { routes } = loadSearch().agents;
  const route = routes[opts.role ?? opts.agent] ?? routes.default;
  if (opts.model) {
    return CLAUDE_MODELS.test(opts.model)
      ? { provider: 'claude', model: opts.model }
      : { provider: 'codex', model: opts.model, effort: route.provider === 'codex' ? route.effort : undefined, fallback: routes.default };
  }
  if (route.provider === 'codex' && needsConnectors(opts.tools ?? [])) return routes.default;
  return route;
}

interface RunState { text: string; data?: unknown; cost?: number; turns?: number; error?: string; toolCalls: number }

function claudeCommand(opts: AgentOptions, route: AgentRoute) {
  const tools = opts.tools ?? DEFAULT_TOOLS;
  // Prompt goes over stdin: briefing prompts carry whole JDs and context files.
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'acceptEdits',
    '--no-session-persistence',
    `--disallowedTools=${[...ALWAYS_DENY, ...(opts.disallow ?? [])].join(',')}`,
  ];
  args.push(tools.length ? `--allowedTools=${tools.join(',')}` : '--tools=');
  args.push('--model', route.model);
  if (opts.schema) args.push('--json-schema', JSON.stringify(opts.schema));
  if (opts.maxTurns) args.push('--max-turns', String(opts.maxTurns));
  if (opts.appendSystem) args.push('--append-system-prompt', opts.appendSystem);
  if (opts.appendSystemFile) args.push('--append-system-prompt-file', opts.appendSystemFile);
  if (opts.strictMcp) args.push('--strict-mcp-config');
  return { bin: findClaude(), args, input: opts.prompt, cleanup: () => {} };
}

function onClaudeLine(msg: any, runId: number, route: AgentRoute, s: RunState) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    db.prepare('UPDATE runs SET model = ?, session_id = ? WHERE id = ?').run(msg.model ?? route.model, msg.session_id ?? null, runId);
  } else if (msg.type === 'assistant') {
    for (const block of msg.message?.content ?? []) {
      if (block.type === 'tool_use') logEvent(runId, 'tool', describeTool(block.name, block.input ?? {}));
      else if (block.type === 'text' && block.text?.trim()) logEvent(runId, 'text', block.text.trim());
    }
  } else if (msg.type === 'result') {
    s.text = msg.result ?? '';
    s.data = msg.structured_output;
    s.cost = msg.total_cost_usd;
    s.turns = msg.num_turns;
    if (msg.is_error || (msg.subtype && msg.subtype !== 'success')) s.error = s.error ?? (msg.subtype || 'agent error');
  }
}

/** Codex structured output is strict: every object closed, every property required. Optional fields become nullable. */
export function strictSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = { ...schema };
  if (out.items) out.items = strictSchema(out.items);
  if (out.properties) {
    const required = new Set<string>(out.required ?? []);
    out.properties = Object.fromEntries(Object.entries<any>(out.properties).map(([k, v]) => {
      const strict = strictSchema(v);
      if (!required.has(k) && strict.type) strict.type = [].concat(strict.type, 'null' as any);
      return [k, strict];
    }));
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  return out;
}

/** Optional fields come back as null from a strict schema; callers expect them absent. */
function dropNulls(value: any): any {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, dropNulls(v)]));
}

function codexCommand(opts: AgentOptions, route: AgentRoute) {
  const tools = opts.tools ?? DEFAULT_TOOLS;
  const writes = tools.some((t) => t === 'Write' || t === 'Edit' || t.startsWith('Bash'));
  const web = tools.includes('WebSearch') || tools.includes('WebFetch');
  // The user's config is ignored so no MCP server or plugin can reach the run; shell network stays off, web reads go through Codex search.
  const args = [
    'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
    '--sandbox', writes ? 'workspace-write' : 'read-only',
    '--model', route.model,
    '--cd', opts.cwd ?? ROOT,
    '-c', 'approval_policy="never"',
    '-c', `web_search="${web ? 'live' : 'disabled'}"`,
  ];
  if (route.effort) args.push('-c', `model_reasoning_effort="${route.effort}"`);
  for (const dir of opts.writableDirs ?? []) args.push('--add-dir', dir);
  let tmp: string | null = null;
  if (opts.schema) {
    tmp = mkdtempSync(join(tmpdir(), 'gigglegig-'));
    writeFileSync(join(tmp, 'schema.json'), JSON.stringify(strictSchema(opts.schema)));
    args.push('--output-schema', join(tmp, 'schema.json'));
  }
  args.push('-');
  // Codex has no system-prompt flag: stable instructions lead the prompt, so its prefix still caches.
  const system = [opts.appendSystemFile ? readFileSync(opts.appendSystemFile, 'utf8') : null, opts.appendSystem].filter(Boolean).join('\n\n');
  const input = system ? `${system}\n\n---\n\n${opts.prompt}` : opts.prompt;
  return { bin: findCodex(), args, input, cleanup: () => { if (tmp) rmSync(tmp, { recursive: true, force: true }); } };
}

function onCodexLine(msg: any, runId: number, route: AgentRoute, s: RunState, limit: number | undefined, stop: (why: string) => void) {
  if (msg.type === 'thread.started') {
    db.prepare('UPDATE runs SET model = ?, session_id = ? WHERE id = ?').run(`${route.model}${route.effort ? ` (${route.effort})` : ''}`, msg.thread_id ?? null, runId);
  } else if (msg.type === 'item.completed') {
    const item = msg.item ?? {};
    if (item.type === 'agent_message') {
      if (item.text?.trim()) logEvent(runId, 'text', item.text.trim());
      s.text = item.text ?? s.text;
    } else if (['command_execution', 'web_search', 'file_change', 'mcp_tool_call'].includes(item.type)) {
      const what = item.type === 'command_execution' ? `shell · ${String(item.command).replace(/^\/bin\/\w+ -lc /, '').slice(0, 160)}`
        : item.type === 'web_search' ? `web · ${String(item.query ?? item.action?.url ?? '').slice(0, 160)}`
          : item.type === 'file_change' ? `edit · ${(item.changes ?? []).map((c: any) => c.path).join(', ').slice(0, 160)}` : item.type;
      logEvent(runId, 'tool', what);
      s.turns = ++s.toolCalls;
      // Codex has no --max-turns: the same bound is enforced here.
      if (limit && s.toolCalls > limit) stop(`stopped after ${limit} tool calls`);
    }
  } else if (msg.type === 'turn.failed') {
    s.error = s.error ?? (msg.error?.message || 'agent error');
  } else if (msg.type === 'error' && !/reconnect/i.test(msg.message ?? '')) {
    s.error = s.error ?? (msg.message || 'agent error');
  }
}

function runOnce<T>(opts: AgentOptions, route: AgentRoute): Promise<AgentResult<T>> {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO runs (agent, job_id, model, provider, owner_pid) VALUES (?, ?, ?, ?, ?)')
    .run(opts.agent, opts.jobId ?? null, route.model, route.provider, process.pid);
  const runId = Number(lastInsertRowid);
  const s: RunState = { text: '', toolCalls: 0 };

  return new Promise((resolve) => {
    let finished = false;
    let cleanup = () => {};
    const finish = (code: number | null, stderr: string) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (code !== 0 && !s.error) s.error = stderr.trim().split('\n').slice(-3).join(' ') || `exit ${code}`;
      if (opts.schema && s.data === undefined && !s.error) {
        // Codex answers in the final text; some Claude runs do too.
        try { s.data = JSON.parse(s.text.replace(/^```(json)?|```$/gm, '').trim()); } catch { s.error = 'no structured output'; }
      }
      if (route.provider === 'codex' && s.data !== undefined) s.data = dropNulls(s.data);
      const stopped = (db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as any)?.status === 'stopped';
      if (stopped) s.error = 'stopped from the desk';
      const ok = !s.error;
      if (s.error && !stopped) logEvent(runId, 'error', s.error);
      db.prepare(`UPDATE runs SET status = ?, ended_at = COALESCE(ended_at, datetime('now')),
          duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER),
          turns = ?, cost_usd = ?, summary = ?, error = ? WHERE id = ?`)
        .run(stopped ? 'stopped' : ok ? 'done' : 'failed', s.turns ?? null, s.cost ?? null, s.text.slice(0, 500) || null, s.error ?? null, runId);
      resolve({ runId, ok, text: s.text, data: s.data as T | undefined, costUsd: s.cost, error: s.error });
    };

    let child;
    try {
      const cmd = route.provider === 'codex' ? codexCommand(opts, route) : claudeCommand(opts, route);
      cleanup = cmd.cleanup;
      const env = { ...process.env, ...opts.env, ...(opts.env?.CAREER_OPS_CLI ? { CAREER_OPS_CLI: route.provider } : {}) };
      child = spawn(cmd.bin, cmd.args, { cwd: opts.cwd ?? ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdin.on('error', () => { /* the child exited before reading; close reports why */ });
      child.stdin.end(cmd.input);
    } catch (e: any) {
      s.error = e.message;
      return finish(1, '');
    }
    const proc = child;
    db.prepare('UPDATE runs SET pid = ? WHERE id = ?').run(proc.pid ?? null, runId);
    let stderr = '';
    const stop = (why: string) => { s.error = s.error ?? why; proc.kill('SIGTERM'); };
    const timer = setTimeout(() => stop(`timed out after ${Math.round((opts.timeoutMs ?? 15 * 60_000) / 1000)}s`), opts.timeoutMs ?? 15 * 60_000);

    createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg: any;
      try { msg = JSON.parse(line); } catch { return; }
      if (route.provider === 'codex') onCodexLine(msg, runId, route, s, opts.maxTurns, stop);
      else onClaudeLine(msg, runId, route, s);
    });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('error', (e) => { clearTimeout(timer); s.error = s.error ?? e.message; finish(1, stderr); });
    proc.on('close', (code) => { clearTimeout(timer); finish(code, stderr); });
  });
}

// Codex can be logged out, missing or out of plan usage; none of those are the job's fault, so the run moves to the fallback.
const PROVIDER_DOWN = /usage limit|rate.?limit|quota|too many requests|\b429\b|not logged in|unauthori[sz]ed|\b401\b|enoent|not found|no such file|capacity/i;

export async function runAgent<T = unknown>(opts: AgentOptions): Promise<AgentResult<T>> {
  const route = routeFor(opts);
  const first = await runOnce<T>(opts, route);
  if (first.ok || !route.fallback || !PROVIDER_DOWN.test(first.error ?? '')) return first;
  logEvent(first.runId, 'log', `${route.provider} unavailable; retrying on ${route.fallback.provider} (${route.fallback.model})`);
  return runOnce<T>(opts, route.fallback);
}

/** Run tasks with bounded parallelism so a briefing doesn't blow through subscription limits. */
export async function pool<I, O>(items: I[], size: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/** Log lines from deterministic (non-LLM) steps so they show up on the desk too. */
export function startRun(agent: string) {
  const { lastInsertRowid } = db.prepare('INSERT INTO runs (agent, pid, owner_pid) VALUES (?, ?, ?)').run(agent, process.pid, process.pid);
  const runId = Number(lastInsertRowid);
  return {
    runId,
    log: (text: string) => logEvent(runId, 'log', text),
    finish(summary: string, err?: string) {
      if (err) logEvent(runId, 'error', err);
      db.prepare(`UPDATE runs SET status = ?, ended_at = datetime('now'),
          duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER),
          summary = ?, error = ? WHERE id = ? AND status = 'running'`).run(err ? 'failed' : 'done', summary, err ?? null, runId);
    },
  };
}
