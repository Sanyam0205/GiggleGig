import { existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

// API keys live in .env (gitignored); see .env.example.
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
export const DATA_DIR = join(ROOT, 'data');
// JOBSOS_DB points the whole system at another database (demo data, tests).
export const DB_PATH = process.env.JOBSOS_DB ?? join(DATA_DIR, 'jobs.db');
export const CONTEXT_DIR = join(ROOT, 'context');
export const CONFIG_DIR = join(ROOT, 'config');
export const OUTPUT_DIR = join(ROOT, 'output');
export const JOBS_OUT = join(OUTPUT_DIR, 'jobs');
export const DESK_DIR = join(ROOT, 'desk');

function which(cmd: string): string | null {
  try {
    return execFileSync('/usr/bin/which', [cmd], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

/** Claude Code binary: $CLAUDE_BIN, PATH, standalone install, then the newest editor-bundled copy. */
export function findClaude(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const onPath = which('claude');
  if (onPath) return onPath;
  for (const p of [join(homedir(), '.local/bin/claude'), join(homedir(), '.claude/local/claude')]) {
    if (existsSync(p)) return p;
  }
  const bundled: string[] = [];
  for (const dir of ['.vscode/extensions', '.cursor/extensions']) {
    const base = join(homedir(), dir);
    if (!existsSync(base)) continue;
    for (const ext of readdirSync(base)) {
      const bin = join(base, ext, 'resources/native-binary/claude');
      if (ext.startsWith('anthropic.claude-code') && existsSync(bin)) bundled.push(bin);
    }
  }
  bundled.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (bundled[0]) return bundled[0];
  throw new Error('Claude Code binary not found. Set CLAUDE_BIN or install: curl -fsSL https://claude.ai/install.sh | bash');
}

/** Codex CLI binary: $CODEX_BIN, PATH, then the copy bundled with the ChatGPT desktop app. */
export function findCodex(): string {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const onPath = which('codex');
  if (onPath) return onPath;
  const bundled = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
  if (existsSync(bundled)) return bundled;
  throw new Error('Codex binary not found. Set CODEX_BIN or install the ChatGPT desktop app.');
}

/** Python >= 3.10 for JobSpy: $PYTHON_BIN, project .venv, then versioned binaries on PATH. */
export function findPython(): string | null {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = join(ROOT, '.venv/bin/python');
  if (existsSync(venv)) return venv;
  for (const v of ['3.13', '3.12', '3.11', '3.10']) {
    const p = which(`python${v}`);
    if (p) return p;
  }
  return null;
}
