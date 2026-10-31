---
name: job-fit-scorer
description: Score a job 1–5 with the career-ops A–G evaluation (CV match, North Star, comp, culture, red flags) and decide Apply / Consider / Research first / Skip.
argument-hint: "<desk job-id | URL | pasted JD>"
---

# /job-fit-scorer → career-ops oferta

This command runs the embedded career-ops engine (`modes/oferta.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **oferta** (`modes/oferta.md`) on the job. For a desk job id, get its URL and JD with `node os/cli.ts job <id>` (it writes `output/jobs/<id>/jd.md`).
Write the report and tracker TSV exactly as the mode specifies, run `cd engine/career-ops && node merge-tracker.mjs`, then `node os/cli.ts engine sync`.
