// macOS launchd jobs: the desk server stays up, the briefing runs at 07:00, scouts refresh every 4 hours.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DATA_DIR, findClaude, findCodex, findPython, ROOT } from './paths.ts';
import { loadSearch } from './config.ts';

const AGENTS = join(homedir(), 'Library/LaunchAgents');
const LOGS = join(DATA_DIR, 'logs');

interface Job { label: string; args: string[]; when: { calendar?: { Hour: number; Minute: number }; interval?: number; keepAlive?: boolean } }

const JOBS: Job[] = [
  { label: 'os.jobsearch.desk', args: ['serve'], when: { keepAlive: true } },
  { label: 'os.jobsearch.briefing', args: ['briefing'], when: { calendar: { Hour: 7, Minute: 0 } } },
  // Scout only; the fast lane and the morning briefing score what it finds, so plan usage stays predictable.
  { label: 'os.jobsearch.scout', args: ['scout', 'ats', 'jobspy', 'jsearch', 'adzuna', 'jooble', 'remoteok', 'remotive', 'gmail'], when: { interval: 4 * 3600 } },
  { label: 'os.jobsearch.watch', args: ['watch'], when: { interval: 1800 } },
  { label: 'os.jobsearch.fastlane', args: ['fastlane'], when: { interval: (loadSearch().fastlane.everyMinutes ?? 90) * 60 } },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function plist(job: Job) {
  const env: Record<string, string> = {
    PATH: `${join(homedir(), '.local/bin')}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`,
    CLAUDE_BIN: findClaude(),
    HOME: homedir(),
  };
  const py = findPython();
  if (py) env.PYTHON_BIN = py;
  try { env.CODEX_BIN = findCodex(); } catch { /* Codex routes fall back to Claude */ }
  const when = job.when.keepAlive
    ? '<key>KeepAlive</key><true/><key>RunAtLoad</key><true/>'
    : job.when.calendar
      ? `<key>StartCalendarInterval</key><dict><key>Hour</key><integer>${job.when.calendar.Hour}</integer><key>Minute</key><integer>${job.when.calendar.Minute}</integer></dict>`
      : `<key>StartInterval</key><integer>${job.when.interval}</integer>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${job.label}</string>
  <key>ProgramArguments</key><array>
    <string>${esc(process.execPath)}</string><string>${esc(join(ROOT, 'os/cli.ts'))}</string>
    ${job.args.map((a) => `<string>${esc(a)}</string>`).join('')}
  </array>
  <key>WorkingDirectory</key><string>${esc(ROOT)}</string>
  <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `<key>${k}</key><string>${esc(v)}</string>`).join('')}</dict>
  ${when}
  <key>StandardOutPath</key><string>${esc(join(LOGS, job.label + '.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(join(LOGS, job.label + '.log'))}</string>
</dict></plist>
`;
}

function launchctl(...args: string[]) {
  try { execFileSync('/bin/launchctl', args, { stdio: 'ignore' }); } catch { /* not loaded */ }
}

export function schedule(action: string) {
  const uid = String(process.getuid?.() ?? 501);
  if (action === 'install') {
    mkdirSync(AGENTS, { recursive: true });
    mkdirSync(LOGS, { recursive: true });
    for (const job of JOBS) {
      const path = join(AGENTS, `${job.label}.plist`);
      launchctl('bootout', `gui/${uid}`, path);
      writeFileSync(path, plist(job));
      launchctl('bootstrap', `gui/${uid}`, path);
    }
    return `Installed ${JOBS.length} launchd jobs. Logs: ${LOGS}. The Mac must be awake at 07:00 (System Settings → Battery → Options to schedule wake).`;
  }
  if (action === 'uninstall') {
    for (const job of JOBS) {
      const path = join(AGENTS, `${job.label}.plist`);
      launchctl('bootout', `gui/${uid}`, path);
      if (existsSync(path)) unlinkSync(path);
    }
    return 'Removed all Job Search OS launchd jobs.';
  }
  return JOBS.map((j) => ({ job: j.label, installed: existsSync(join(AGENTS, `${j.label}.plist`)), runs: j.args.join(' ') }));
}
