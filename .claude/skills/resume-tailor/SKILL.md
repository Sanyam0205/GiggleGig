---
name: resume-tailor
description: Tailor a one-page, fact-checked CV for one job with career-ops pdf mode: keyword + skill-gap analysis, tailored payload, title/structure checks, verify-cv-facts hard gate, A4 render, keyword coverage.
argument-hint: "<desk job-id | report number> [instructions]"
---

# /resume-tailor → career-ops pdf

This command runs the embedded career-ops engine (`modes/pdf.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Prefer the desk pipeline, which also books the approval slip: `node os/cli.ts tailor <job-id> --notes "<instructions>"` (it evaluates first if the job has no report).
Run interactively only when the user wants to steer each step: follow `modes/pdf.md` (plus `--hm-audit` if asked) for the job's report, render with `generate-pdf.mjs --report=<N> --max-pages=1 --strict-pages`, never ship a CV `verify-cv-facts.mjs` blocks, then run `node os/cli.ts engine sync`.
