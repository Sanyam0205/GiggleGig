#!/usr/bin/env node
// One-command install: `npm run setup`. Safe to run again; every step skips what is already done.
// Installs dependencies, builds the desk, creates the Python environment for JobSpy, and lays out the (empty) candidate folders.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'engine/career-ops');
const DATA = join(ROOT, 'engine-data');
const say = (m) => console.log(`\n▸ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
const quiet = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
const onPath = (bin) => quiet('/usr/bin/which', [bin]).status === 0;

// 1. Node
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 23 || (major === 23 && minor < 6)) {
  console.error(`Node ${process.versions.node} is too old. Install Node 23.6 or newer (https://nodejs.org), then run this again.`);
  process.exit(1);
}

// 2. The engine is a git submodule
say('Fetching the engine (git submodule)');
if (!existsSync(join(ENGINE, 'package.json'))) {
  if (!existsSync(join(ROOT, '.git'))) { console.error('engine/ is empty and this is not a git checkout. Clone with: git clone --recurse-submodules <repo-url>'); process.exit(1); }
  if (run('git', ['submodule', 'update', '--init', '--recursive']).status !== 0) process.exit(1);
} else console.log('  already present');

// 3. Dependencies. The engine's install also downloads the Chromium its PDF renderer uses.
say('Installing engine dependencies (includes Chromium for PDF output; a few minutes the first time)');
if (run('npm', ['install', '--no-audit', '--no-fund'], { cwd: ENGINE }).status !== 0) process.exit(1);
say('Installing and building the desk');
if (run('npm', ['--prefix', 'desk', 'install', '--no-audit', '--no-fund']).status !== 0) process.exit(1);
if (run('npm', ['--prefix', 'desk', 'run', 'build']).status !== 0) process.exit(1);

// 4. Python for JobSpy (LinkedIn / Indeed / Naukri / Glassdoor / Google Jobs). Optional.
say('Python environment for JobSpy (optional)');
const py = ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3'].find((b) => {
  if (!onPath(b)) return false;
  const v = quiet(b, ['-c', 'import sys; print(sys.version_info >= (3, 10))']);
  return v.status === 0 && v.stdout.trim() === 'True';
});
if (!py) warn('Python 3.10+ not found. JobSpy sources are skipped; everything else works. Install Python 3.10+ and run this again.');
else if (existsSync(join(ROOT, '.venv/bin/python'))) console.log('  .venv already present');
else if (run(py, ['-m', 'venv', '.venv']).status !== 0 || run('.venv/bin/pip', ['install', '--quiet', '-r', 'requirements.txt']).status !== 0) {
  warn('Could not set up the Python environment. JobSpy sources are skipped; everything else works.');
}

// 5. Settings and the empty candidate workspace (filled by the first resume upload)
say('Creating local settings and empty candidate folders');
if (!existsSync(join(ROOT, '.env'))) { copyFileSync(join(ROOT, '.env.example'), join(ROOT, '.env')); console.log('  .env created (job-board API keys are optional)'); }
for (const d of ['context', 'engine-data/data', 'engine-data/inbox', 'engine-data/modes', 'engine-data/config', 'output', 'data']) mkdirSync(join(ROOT, d), { recursive: true });
const marker = join(ENGINE, '.career-ops-data');
if (!existsSync(marker)) writeFileSync(marker, '../../engine-data\n');
const tracker = join(DATA, 'data/applications.md');
if (!existsSync(tracker)) {
  writeFileSync(tracker, '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n');
}
const pipeline = join(DATA, 'data/pipeline.md');
if (!existsSync(pipeline)) writeFileSync(pipeline, '# Pipeline — Pending URLs\n\n## Pending\n\n## Processed\n');
// The engine copies its blank profile templates into engine-data; the resume upload fills them in.
const init = quiet(process.execPath, ['doctor.mjs', '--json', '--init-templates'], { cwd: ENGINE, env: { ...process.env, CAREER_OPS_ROOT: DATA } });
if (init.status !== 0 && !init.stdout.includes('onboardingNeeded')) warn(`Template setup reported a problem: ${(init.stderr || init.stdout).trim().split('\n').slice(-2).join(' ')}`);

// 6. Commit guard: blocks secrets
if (existsSync(join(ROOT, '.git'))) quiet('git', ['config', 'core.hooksPath', '.githooks']);

// 7. Agent CLIs
say('Checking the agent CLIs');
const claude = process.env.CLAUDE_BIN || (onPath('claude') ? 'claude' : null) || (existsSync(join(process.env.HOME ?? '', '.local/bin/claude')) ? 'claude' : null);
console.log(claude ? '  Claude Code: found' : '  ! Claude Code: NOT found. Install it (https://claude.com/claude-code) and sign in; the agents need it.');
console.log(onPath('codex') || existsSync('/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex') ? '  Codex: found (optional)' : '  Codex: not found (optional)');

console.log(`\n✓ Setup finished.\n\nNext:\n  npm run desk         # then open http://localhost:4321\n  On the Agents page, upload the candidate's resume. That builds the profile and starts the search.\n`);
