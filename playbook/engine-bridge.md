# Running a career-ops mode from this project

career-ops is embedded at `engine/career-ops` (system layer, pinned release) with its user layer in `engine-data/`.
A wrapper skill in `.claude/skills/` runs one of its modes like this:

1. **Read the rules first:** `engine/career-ops/AGENTS.md` (Data Contract, Source-of-Truth Boundary, Untrusted External
   Content, Ethical Use), then `engine/career-ops/modes/_shared.md`, then the mode file named by the wrapper
   (`engine/career-ops/modes/<mode>.md`), then the user layer: `engine-data/modes/_profile.md`, `engine-data/modes/_custom.md`.
2. **Paths:** the data root is `engine-data/`. Wherever a mode names `cv.md`, `article-digest.md`, `config/profile.yml`,
   `portals.yml`, `data/`, `reports/`, `output/`, `jds/`, `interview-prep/` or `batch/tracker-additions/`, use the file under
   `engine-data/`. Every `.mjs` script, `templates/` and other `modes/` file is under `engine/career-ops/`.
3. **Scripts:** run them from the engine checkout: `cd engine/career-ops && node <script>.mjs …`. The `.career-ops-data`
   marker there already points scripts at `engine-data/`.
4. **Truth:** facts come only from `engine-data/cv.md`, `engine-data/article-digest.md`, `engine-data/config/profile.yml` and
   `engine-data/modes/_profile.md`. Respect every DO NOT CLAIM line in article-digest.md.
5. **Desk hand-off:** anything outbound (a message, email, application) goes to the approval queue, never sent:
   `node os/cli.ts queue <kind> <job-id|-> "<title>" <file.json>`. Status changes go through
   `cd engine/career-ops && node set-status.mjs --report <N> <State> --note "…"`; the desk mirrors the tracker within 30 s.
   Find a job's desk id and report number with `node os/cli.ts find "<company>"`.
6. **Unattended** (run from the desk or scheduler): don't ask questions, note assumptions in the output, never submit.
