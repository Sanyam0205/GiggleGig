# GiggleGig

A personal, agent-run job search that runs on your own computer. Upload a resume and GiggleGig:

1. builds a candidate profile from it,
2. when you press **Search**, looks everywhere for matching roles: LinkedIn, Naukri, Indeed and Google Jobs; startup boards (Wellfound, Y Combinator, Cutshort,
   Instahyre and more); remote boards; the career pages of 100+ companies, from startups to big MNCs; Firecrawl crawls of sites the others miss; and your job-alert emails,
3. gives every role a quick review against the profile and your rules (remote, pay floor, experience), and drops the rest,
4. evaluates in depth only the roles you pick, then writes a tailored one-page CV for the ones you choose, using only facts from the resume,
5. drafts the application answers and outreach, and tracks everything on a local dashboard (the **desk**).

**Nothing is sent or submitted for you.** Agents write drafts and you approve them on the desk. Email items become Gmail drafts, and you press Send yourself.

```
upload resume → profile built and checked
  → you press Search → every source scanned → quick review (cheap, automatic)
  → you pick roles → full evaluation → you press Tailor → fact-checked CV → you approve → apply (stops before Submit)
```

Nothing runs on its own: every search, evaluation and CV starts from a button (or a command), and the desk shows your AI plan's limits before you press it.

### What it does

| | |
|---|---|
| **Finds roles everywhere** | LinkedIn, Naukri, Indeed, Google Jobs, Wellfound, Y Combinator, Cutshort, Instahyre, remote boards, Hacker News "Who is hiring", company career pages (Greenhouse, Lever, Ashby, Workday and more), Firecrawl crawls and job-alert emails. Any company's career site can be searched by name. |
| **Screens properly** | Duplicates merged by link, non-job links dropped, the full job description fetched first, pay floor / experience / remote-or-India rules applied. A role without a readable full description cannot pass the quick review. |
| **Remote and India** | Remote roles open to India, plus office or hybrid roles in Indian cities. Remote scores higher; region-locked remote and offices abroad are dropped. |
| **Tailors truthfully** | A one-page, ATS-friendly CV (PDF and Word) built only from facts in your resume, fact-checked, then read by three reviewer agents (ATS parser, recruiter, hiring manager). |
| **Drafts, never sends** | Application answers, cover letters, referral asks and outreach are drafts you approve. It stops before Submit. |
| **Tracks the search** | Applications by stage, interviews and prep, contacts, follow-ups. Backups and CSV export keep your data safe through updates. |
| **Shows its limits** | Claude usage and Firecrawl credits are shown before you press anything. Nothing runs by itself. |
| **Works on a phone** | Same Wi-Fi, tokenised link, dark and light themes. |

Everything runs locally: a Node server, one SQLite file, and AI agents driven through the command-line tools you already have signed in (Claude Code, optionally Codex). There are no accounts, no hosted service and no API bill beyond your own AI plan.

> **Single user, local use.** The desk has no logins. Do not expose it to the internet. See [Security and privacy](#security-and-privacy).

---

## What you need

| Requirement | Why | Notes |
|---|---|---|
| **macOS or Linux** | The app itself | The automatic schedule (`launchd`) is macOS only. Windows is untested. |
| **Node.js 23.6 or newer** | Runs the server and scripts | <https://nodejs.org> |
| **git** | The workflow engine is a git submodule | |
| **[Claude Code](https://claude.com/claude-code)**, signed in | Runs the agents | Install it, then run `claude` once and sign in. A paid Claude plan is needed for real use. |
| Python 3.10 or newer | Optional: LinkedIn, Indeed, Naukri, Glassdoor and Google Jobs scraping (JobSpy) | Without it, every other source still works. |
| Codex CLI (ChatGPT app) | Optional: can run some agent roles instead of Claude | See [Choosing which AI runs each job](#choosing-which-ai-runs-each-job). |
| [Firecrawl](https://firecrawl.dev) account | Optional: crawls career pages and job platforms the other sources cannot read | The project's `.mcp.json` adds the Firecrawl MCP server. Approve it and sign in once: run `claude` in this folder, then `/mcp`. Calls use Firecrawl credits. |
| Gmail and Google Calendar connected to your Claude account | Optional: job-alert emails, the inbox watcher, interview detection, Gmail drafts | Connect them in Claude's connector settings. Agents get read and draft access only. |

---

## Quick start

```bash
git clone --recurse-submodules <this-repo-url> gigglegig
cd gigglegig
npm run setup        # installs everything and builds the desk (a few minutes the first time)
npm run desk         # starts the desk
```

Open **<http://localhost:4321>**, go to **Profile**, and choose the candidate's resume (PDF, DOCX, TXT or Markdown, up to 5 MB).
Intake takes about two minutes (PDFs and DOCX files are converted to text first). Then press **Search now** (Today, Find or Review).

If you cloned without `--recurse-submodules`, run `git submodule update --init` (setup does this for you).

### What `npm run setup` does
It is safe to run again; each step skips what is already done.

1. Checks your Node version and fetches the engine submodule (`engine/career-ops`).
2. Installs the engine's dependencies, including the Chromium browser it uses to make PDFs.
3. Installs and builds the desk (`desk/`).
4. Creates a Python virtual environment in `.venv/` and installs JobSpy and pypdf (for PDF resumes). Skipped with a warning if Python 3.10+ is missing; upload DOCX then.
5. Creates `.env` from `.env.example`, and the empty candidate folders (`context/`, `engine-data/`, `data/`, `output/`).
6. Turns on the commit guard that blocks secrets (`git config core.hooksPath .githooks`).
7. Tells you whether Claude Code and Codex were found.

<details>
<summary>Doing the same steps by hand</summary>

```bash
git submodule update --init
(cd engine/career-ops && npm install)        # also downloads Chromium for PDFs
npm --prefix desk install && npm --prefix desk run build
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt    # optional, Python 3.10+
cp .env.example .env
mkdir -p context output engine-data/data engine-data/inbox engine-data/modes engine-data/config data
echo '../../engine-data' > engine/career-ops/.career-ops-data
(cd engine/career-ops && CAREER_OPS_ROOT=../../engine-data node doctor.mjs --json --init-templates)
git config core.hooksPath .githooks
```
</details>

### Check that it works
```bash
npm run doctor       # before a resume is uploaded it reports "onboardingNeeded": true. That is expected.
```
After the resume upload finishes, `npm run doctor` should report `"onboardingNeeded": false` and an empty `missing` list.

---

## Using the desk

Five areas, in a black rail on the left (a tab bar at the bottom on phones). Light and dark themes follow your system; the switch at the
bottom of the rail fixes one.

| Area | What it is for |
|---|---|
| **Today** | What needs you now: CVs and messages waiting for your approval, roles agents are working on, new matches, follow-ups, the next interview, and the agent register. |
| **Find** | **Search everything now**; one company's own career site on demand (MNCs included, see below); which sources found what. |
| **Review** | Every role worth a look, as classified boxes: the heavier the box, the better the fit. The selected role's full description, checks, pay and verdict sit beside the list. |
| **Applications** | Everything you acted on, by stage: CV ready → Applied → Interviewing → Closed, plus interview prep. **Export CSV** and **Back up now** live here. |
| **Profile** | Your resume and your rules; sources and alerts; contacts; usage and limits; your data (backups). |

The **Agents** button in the rail opens the agent register from anywhere: every run, its steps as they happen, and **Stop**.

### The flow, start to finish

1. **Search.** **Search now** (Today, Find or Review). Roles are saved as each source finishes. Each one's full job description is
   fetched first (the company's ATS, then the posting page itself, then Firecrawl), and then it gets a quick review (about $0.02 for 8 roles).
   Duplicates, links that are not postings (videos, profiles), office roles abroad, region-locked remote roles, internships and posted pay
   below your floor are dropped before any AI is used. A role whose description could not be read never passes the quick review; it is
   marked "JD incomplete" and **Fetch it and review again** retries it.
2. **Pick.** On **Review**, read the boxes and the full read beside them. Keys: `j`/`k` move, `t` tailor, `e` evaluate, `s` skip,
   `o` open the posting, `x` pick for a batch.
3. **Evaluate.** **Evaluate** writes a full report: requirement-by-requirement match, pay, red flags and a verdict (about 3 minutes).
4. **Tailor.** **Tailor CV** writes a one-page CV from your resume, fact-checked against it. Three reviewer agents (an ATS parser,
   a recruiter's 6-second scan, a hiring manager) read it, and one automatic revision fixes what they flag. You get a PDF and a Word copy.
5. **Apply.** The CV waits under **Today → Waiting for you** with the reviews. **Approve** opens the apply page; you apply yourself and
   press **Mark applied**. Applied roles also go into the plain-text tracker (`engine-data/data/applications.md`).

Before a big run, glance at **Profile → Usage & data**. If a Claude limit is already hit, the desk refuses to start new runs and tells you when it resets.

### Any company's career page, on demand

**Find** → type a name (Microsoft, Adobe, Razorpay…). GiggleGig looks for, in this order:
1. a public job board (Greenhouse, Lever, Ashby, Workable, SmartRecruiters);
2. a careers site its free adapters read: Workday, SuccessFactors, Oracle, Eightfold, iCIMS, Taleo, Amazon, Google, IBM and dozens more;
3. otherwise an agent opens the company's careers site with Firecrawl, which renders JavaScript-heavy pages, and reads its search results.

Whatever it finds is remembered, so that company is checked on every later search too. About 100 companies (startups, big tech and MNCs such as
Salesforce, Adobe, NVIDIA, Intel, PayPal, Amazon, Google and Microsoft) are already on the list in `context/target-companies.json`.

### Your data is safe

- **Updating your resume keeps everything.** Profile → **Update resume** rebuilds your profile from the new file and keeps every job,
  status, note, contact and interview, plus your company list and form answers. **Start a new candidate** is separate: it wipes the job
  history after typing a confirmation, and only after a backup.
- **Backups:** the job database and your profile are copied to `data/backups/` before every risky step (resume upload, duplicate merges,
  restores), and whenever you press **Back up now**. The newest 10 are kept.
  `node os/cli.ts backup --list` lists them; `node os/cli.ts restore-backup <file>` puts one back (stop the desk first for a database restore;
  the current state is backed up before it is replaced).
- **Export:** **Export CSV** on Applications (or `node os/cli.ts export`) writes every application to `data/exports/` as CSV and Markdown.
- **Code updates never touch your data:** `data/`, `engine-data/`, `context/` and `config/search.json` are git-ignored, and database
  changes are only ever added columns.

### Slash commands in Claude Code
Open this folder in Claude Code and type, for example:
`/quick-start <job url>` · `/resume-tailor <job id>` · `/cover-letter` · `/application-kit` · `/referral-request` · `/connection-request` ·
`/hiring-manager-msg` · `/company-research` · `/salary-research` · `/interview-prep` · `/mock-interview` · `/interview-debrief` ·
`/thank-you-note` · `/negotiate` · `/weekly-retro` · `/linkedin-audit`. `/apply-assist <job id>` fills an application form in a browser and stops before Submit
(it needs the Playwright tool: `claude mcp add playwright -- npx @playwright/mcp@latest`).

### Command line
```bash
node os/cli.ts                        # list every command
node os/cli.ts scout --score         # what Search now does: every enabled source, then the quick review
node os/cli.ts scout firecrawl        # specific sources: ats jobspy jsearch adzuna jooble startups firecrawl remoteok remotive hackernews gmail web
node os/cli.ts evaluate <id> <id>     # full evaluation of the roles you pick
node os/cli.ts triage 40              # quick review of up to 40 new roles
node os/cli.ts tailor <job-id> --notes "lead with the LLM work"
node os/cli.ts company "Razorpay"     # every feasible role at one company
node os/cli.ts fastlane               # only postings from the last few hours
node os/cli.ts inbox                  # read hiring emails and update the pipeline
node os/cli.ts restore-profile        # put back the profile a resume upload archived
node os/cli.ts backup | export        # snapshot data/backups/ · applications to data/exports/
node os/cli.ts dedupe                 # merge postings that arrived twice (backs up first)
node os/cli.ts rescreen [job-id …]    # fetch full descriptions and review again
npm run briefing                      # search + calendar + inbox in one go
node os/cli.ts engine doctor          # health check (also: verify, update-check, update, rollback)
```
Until a candidate exists, every command that searches or scores says so and stops.

---

## Configuration

### Search settings: `config/search.json`
Created from `config/search.default.json` the first time the app runs, and **not committed** (it holds one candidate's search). The resume
upload fills in the queries, target titles and locations; edit the file or use **Profile → Sources & alerts** for the rest. Notable settings:

| Setting | Meaning |
|---|---|
| `queries`, `titleInclude`, `titleExclude`, `locations`, `maxAgeDays` | What to look for and what to filter out before any AI is used |
| `remote.only` | `true` keeps only remote roles open to your `locations`. `false` (default for India) also keeps office and hybrid roles in your `locations` (Indian cities); office roles abroad and region-locked remote roles are always dropped before any AI is used |
| `preferences` | Your own rules: `minAnnualSalary` (e.g. `700000` for 7 LPA; posted pay below it is dropped, unknown pay is judged by the reviewer), `experience` (e.g. `"1-2"`), `exclude` (internships, trainee roles…), `remotePreferred` (remote scores higher, offices in your locations still count) and free-form `notes`. They survive a resume upload and are read by every review |
| `sources.*` | Turn each source on or off; `jobspy.sites`, results per query, how recent; `startups` for Wellfound, Y Combinator and the other startup boards |
| `thresholds` | `apply` and `skip` cut-offs on a 0–100 scale (80 = 4.0 out of 5) |
| `automation` | `tailor: "manual"` or `"auto"`, and the minimum score for auto |
| `alerts`, `fastlane`, `inbox` | Phone alerts, the fresh-postings lane, the email watcher (alerts and inbox are off by default) |
| `engine` | Quick-review batch size; `autoEvaluate: false` (default) keeps full evaluation for the roles you pick |
| `sources.firecrawl` | `maxCalls` per run (credits), `maxCompanies` career sites per run, and the `platforms` it searches |
| `limits.jsearchMonthly` | JSearch's free monthly requests; searches stop there |
| `agents.routes` | Which AI runs each job, see below |

### Job-board API keys: `.env`
All optional; each source turns on by itself once its key is present. See `.env.example` for where to get each key (JSearch, Adzuna, Jooble).
`.env` is never committed. Adzuna currently searches India only.

### Choosing which AI runs each job
`config/search.json` → `agents.routes` maps each agent role to a provider and model. Today **every role runs on Claude**.

```json
"scout:web": { "provider": "codex", "model": "gpt-5.6-terra", "effort": "medium",
               "fallback": { "provider": "claude", "model": "haiku" } }
```

- Roles that read Gmail or Calendar (`inbox:scan`, `calendar:scan`, `scout:gmail`, `gmail-draft`) always run on Claude, because those connectors only exist there.
- Codex runs are sandboxed: no extra tools, writes only inside the workspace, web reads through Codex search. Codex cannot currently render the PDF, so keep `resume-tailor` on Claude.
- `fallback` takes over if Codex is logged out, missing or out of plan usage.
- **Compare before you move a role.** In a trial on 47 real postings, some Codex models passed roles the profile rules out. Check a few roles by hand before switching one over. Each Codex call starts at roughly 28k tokens, so a free ChatGPT plan runs out quickly.

### Claude skills that help tailoring

Already available to Claude Code; nothing installs on its own.
- `anthropic-skills:docx`: open a tailored CV as Word and hand-edit it (every CV also ships as `.docx`).
- `anthropic-skills:pdf`: read or merge PDFs, such as a portfolio or certificates, before applying.
- `firecrawl-job-postings`: ask Claude directly to find postings for a role; the desk's Firecrawl crawler uses the same server.
- `firecrawl-lead-research`: research a company or a hiring manager before `/hiring-manager-msg` or `/referral-request`.

### Rough usage
Measured on one run, at API prices (your plan's usage, not a bill): quick review about $0.02 for 8 roles; full evaluation about $0.40 per role; a tailored CV about $1.50.
**Profile → Usage & data** shows the running total for the last 24 hours.

---

## Optional extras

**Run it on a schedule (macOS, off by default).** GiggleGig is built to run when you press a button. If you do want it unattended:
```bash
npm run schedule:install     # desk always on · 07:00 briefing · scout every 4 h · fast lane · inbox and follow-ups every 30 min
npm run schedule:uninstall
```
The Mac must be awake at 07:00 (System Settings → Battery → schedule wake). Logs are in `data/logs/`.

**Gmail and Calendar.** After connecting them to your Claude account, turn on **Gmail alerts** and the **inbox watcher** under **Profile → Sources & alerts**. Agents can read mail and
create drafts. Sending, deleting, labelling and calendar changes are blocked in code.

**Phone alerts.** Install the free [ntfy](https://ntfy.sh) app, subscribe to the topic shown under **Profile → Sources & alerts**, turn alerts on, and press *Send test alert*.
The alert's Approve and Tailor buttons work while your phone is on the same Wi-Fi.

**Phone access.** `npm run desk` prints a LAN link that carries an access token. Open it once on your phone (same Wi-Fi); the token is then remembered in a cookie.

**Warm paths.** Profile → Contacts → import LinkedIn's `Connections.csv` (LinkedIn → Settings → Data privacy → Get a copy of your data).

**Interactive guardrails.** To apply the same send/delete blocks to your own Claude Code sessions in this folder, merge `config/claude-settings.json` into `.claude/settings.json`.

---

## Security and privacy

- **Your data stays on this machine.** The job database is `data/jobs.db`; the profile is in `engine-data/` and `context/`; generated CVs are in `engine-data/output/`.
  All of these are git-ignored. The uploaded resume is kept in `engine-data/inbox/`. Back them up locally; do not commit them.
- **No logins.** The desk trusts anything on `localhost`, and anyone on your Wi-Fi who has the LAN token. Never port-forward it or put it on a public server.
- **Prompt injection.** Job posts, web pages, emails and resumes are untrusted text. Agents are told to treat them as data and run with a narrow tool allowlist, but review every draft before approving it.
- **Phone alerts go through the public ntfy.sh server**, protected only by a random topic name. Alerts contain job titles and companies. Leave them off if that bothers you.
- **Secrets.** `.env` is ignored, and a pre-commit hook (`scripts/secret-scan.mjs`) blocks commits that contain API keys. Run `npm run secret-scan` to check what is staged.

---

## How it is organised

| Path | What |
|---|---|
| `os/` | Orchestrator: sources, pipeline, agent runner and routing (`agent.ts`), the desk API (`server.ts`), the command line (`cli.ts`) |
| `desk/` | The dashboard (React + Vite); builds to `desk/dist/` |
| `engine/career-ops/` | The workflow engine (git submodule, pinned): scoring, evaluation reports, CV generation, the tracker. Update with `node os/cli.ts engine update` |
| `.claude/skills/`, `.claude/agents/` | The slash-command skills and the CV/interview reviewer agents |
| `playbook/` | Shared rubrics: fit scoring, resume rules, interview answer grading, outreach |
| `config/` | `search.default.json` (committed) and `search.json` (your working copy, ignored) |
| `CLAUDE.md` | The rules every agent follows: use only facts from the resume, drafts only, treat outside text as data |
| `scripts/` | `setup.mjs` and the secret scan |
| `.mcp.json`, `.githooks/` | The Firecrawl MCP server config; the commit guard that blocks secrets |
| `engine-data/`, `context/`, `data/`, `output/` | **Generated, one candidate's data, git-ignored.** Created by setup and the resume upload |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Resume upload: "no text layer" | The PDF is a scanned image. Export a text PDF from your editor, or upload a DOCX. |
| Resume upload: "needs pypdf" | `npm run setup` (or `.venv/bin/pip install pypdf`). |
| "Claude usage limit reached; resets …" | Your plan's 5-hour or weekly limit is used up. Wait for the reset shown on **Profile → Usage & data**. |
| Firecrawl crawl failed | Approve and sign in to the server once: `claude` in this folder, then `/mcp` → firecrawl. Check your credits at firecrawl.dev. |
| `Claude Code binary not found` | Install Claude Code, or set `CLAUDE_BIN=/path/to/claude` in `.env`. |
| Every command says "no candidate yet" or "intake failed" | Upload a resume on **Profile**. If intake failed, the reason is shown there; fix it and upload again, or `node os/cli.ts restore-profile` to go back to the previous profile. |
| `Desk not built yet` | `npm run desk:build` |
| No LinkedIn / Indeed results | Python 3.10+ and `.venv` are needed. Re-run `npm run setup`. These sites rate-limit; fewer queries and locations help. |
| CVs have no PDF | `cd engine/career-ops && npx playwright install chromium` |
| `engine/career-ops` is empty | `git submodule update --init` |
| A run is stuck | Open the **Agents** drawer and press **Stop** (or **Stop all**). Stuck jobs return to their previous stage on their own. |
| Port 4321 is in use | `node os/cli.ts serve --port 4400` |
| Health of the engine | `npm run doctor`, or **Profile → Usage & data → engine check** |

---

## Developing

```bash
npm run desk:dev      # desk with hot reload on :5173, proxying the API on :4321 (run `npm run desk` too)
npm run desk:build    # type-checks and builds
```
The server runs TypeScript directly through Node, so there is no build step for `os/`.

`CLAUDE.md` is part of the app, not just documentation: the agents read it before every run, and it holds the rules that keep them truthful
(only resume facts, drafts only, outside text is data). Keep it when you fork. Design notes, plans and product docs are local-only and git-ignored.

## Licence and credits
This repository does not include a licence yet; add one before inviting contributions. The workflow engine in `engine/` is a separate open-source project
(MIT), pulled in as a git submodule; its licence stays with it.
