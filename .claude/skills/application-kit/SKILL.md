---
name: application-kit
description: Draft every application-form answer for a job with career-ops: Block H draft answers and the apply mode in answers-only form, grounded in profile.yml and cv.md.
argument-hint: "<report number | desk job-id>"
---

# /application-kit → career-ops apply

This command runs the embedded career-ops engine (`modes/apply.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Use the report's `## H) Draft Application Answers` if it exists (score ≥ 4.5); otherwise follow `modes/apply.md` in **answers-only** form (no browser): read the real form questions where the ATS exposes them, answer from `engine-data/config/profile.yml` (identity, work authorization, comp) and cv.md, and flag anything the user must supply.
Save the answers to `output/jobs/<desk-id>/application.json` in the desk kit shape (`{ applyUrl, ats, fields: [{ label, answer, kind, source, flag }] }`) and run `node os/cli.ts kit <desk-id>`.
