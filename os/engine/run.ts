// Running the career-ops engine: its zero-token scripts directly, its modes through our headless agent runner.
import { spawn } from 'node:child_process';
import { runAgent, type AgentOptions } from '../agent.ts';
import { ENGINE_DATA, ENGINE_DIR, ENGINE_ENV } from './paths.ts';

export interface ScriptResult { code: number; stdout: string; stderr: string; json?: any }

/** `node <script> …args` inside the engine, with the data root set. Never throws; check `code`. */
export function engineScript(script: string, args: string[] = [], opts: { timeoutMs?: number; input?: string } = {}): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ENGINE_DIR, env: { ...process.env, ...ENGINE_ENV }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs ?? 10 * 60_000);
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.stdin.end(opts.input ?? '');
    child.on('close', (code) => {
      clearTimeout(timer);
      let json: any;
      try { json = JSON.parse(stdout); } catch { /* not JSON */ }
      resolve({ code: code ?? 1, stdout, stderr, json });
    });
  });
}

// What an engine agent may do: read/write the engine's files, run its node scripts, read the web.
// No MCP servers (strict), so Gmail/Calendar are unreachable here; sending is impossible by construction.
export const ENGINE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Bash(node:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(mkdir:*)'];

export function engineAgent(opts: Omit<AgentOptions, 'cwd' | 'env'> & { env?: Record<string, string> }) {
  return runAgent({
    ...opts,
    cwd: ENGINE_DIR,
    env: { ...ENGINE_ENV, ...opts.env },
    tools: opts.tools ?? ENGINE_TOOLS,
    strictMcp: opts.strictMcp ?? true,
    writableDirs: [ENGINE_DATA],
    appendSystem: [opts.appendSystem, 'You are running unattended under the GiggleGig scheduler (an unattended run per modes/_shared.md): do not ask questions, do not check for updates, never submit/send anything, and finish the mode completely.'].filter(Boolean).join('\n\n'),
  });
}
