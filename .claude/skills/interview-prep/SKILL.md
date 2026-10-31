---
name: interview-prep
description: Interview prep with career-ops interview-prep and interview/plan: process overview, audience map, questions by round, story-bank matches, technical checklist, and a time-blocked plan.
argument-hint: "<report number | company> [round]"
---

# /interview-prep → career-ops interview-prep + interview/plan

This command runs the embedded career-ops engine (`modes/interview-prep.md`, `modes/interview/plan.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **interview-prep** (`modes/interview-prep.md`), writing `engine-data/interview-prep/<company>-<role>.md`, then **interview/plan** for a time-blocked plan. Add the Indian product-company loop (OA → DSA → LLD/HLD-lite → HM → HR) when the company follows it. Record the round on the desk: `node os/cli.ts interview add <job-id> <round> "<ISO time>" engine-data/interview-prep/<file>`.
