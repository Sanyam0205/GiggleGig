#!/usr/bin/env node
// Blocks secrets from being committed. Never prints the matched text, only file:line and the rule.
//   node scripts/secret-scan.mjs --staged      scan what is staged (used by the pre-commit hook and CI on a PR diff)
//   node scripts/secret-scan.mjs --tree        scan every tracked-or-untracked, non-ignored file under the repo
//   node scripts/secret-scan.mjs <file> …      scan the named files
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const RULES = [
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style secret key', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['RapidAPI key', /\b[0-9a-f]{10}msh[0-9a-z]+p1[0-9a-z]+jsn[0-9a-z]+\b/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  // key = long-random-looking literal; reading it from the environment or a placeholder is fine
  ['Hard-coded credential', /(?:api[_-]?key|secret|token|passwd|password)\s*[:=]\s*['"]?(?!process\.env|<|\$\{|your|changeme|example|xxx)[A-Za-z0-9_\-/+=]{28,}['"]?/i],
];

// Paths that must never be committed at all.
const FORBIDDEN_PATH = [/(^|\/)\.env$/, /(^|\/)\.env\.(?!example$)[^/]+$/, /^engine-data\/(data|reports|output|jds|batch)\//, /^(data|users)\//, /\.(db|sqlite|sqlite3)(-wal|-shm)?$/, /(^|\/)id_(rsa|ed25519)$/, /\.pem$/];

const SKIP_CONTENT = /(^|\/)(node_modules|\.git|dist|\.venv)\//;
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|db|sqlite)$/i;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const arg = process.argv.slice(2);
let files = [];
let read = (f) => readFileSync(f, 'utf8');

if (arg[0] === '--staged') {
  files = git('diff', '--cached', '--name-only', '--diff-filter=ACM').split('\n').filter(Boolean);
  read = (f) => git('show', `:${f}`);
} else if (arg[0] === '--tree') {
  files = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean);
} else {
  files = arg;
}

const findings = [];
for (const f of files) {
  if (FORBIDDEN_PATH.some((re) => re.test(f))) findings.push(`${f}: path must never be committed`);
  if (SKIP_CONTENT.test(f) || BINARY.test(f) || !existsSync(f) && arg[0] !== '--staged') continue;
  // The vendored engine is third-party code with example keys in docs; our own secrets never live there.
  if (f.startsWith('engine/') && arg[0] !== '--staged') continue;
  let text;
  try { if (arg[0] !== '--staged' && statSync(f).size > 2_000_000) continue; text = read(f); } catch { continue; }
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of RULES) if (re.test(line)) findings.push(`${f}:${i + 1}: ${name}`);
  });
}

if (findings.length) {
  console.error('\nSecret scan FAILED. Remove these (and rotate anything real), then retry:\n');
  for (const f of findings) console.error('  ✗ ' + f);
  console.error('\nValues are never printed. Put real keys in .env (gitignored) and reference them from code.\n');
  process.exit(1);
}
console.log(`Secret scan clean (${files.length} files).`);
