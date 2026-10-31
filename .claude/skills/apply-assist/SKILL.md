---
name: apply-assist
description: Fill a job application form with career-ops apply mode: Playwright browser the project launches, answers from the report and profile, resume attached, and STOP before Submit.
argument-hint: "<report number | desk job-id>"
---

# /apply-assist → career-ops apply

This command runs the embedded career-ops engine (`modes/apply.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **apply** (`modes/apply.md`) interactively, including its preflight (blacklist, duplicate and repost checks, liveness, knock-out screens). Use only the browser launch options from `node apply-scope.mjs launch-options`. Never click Submit/Send/Apply. When the user confirms they submitted: `cd engine/career-ops && node set-status.mjs --report <N> Applied`.
