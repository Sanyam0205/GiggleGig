---
name: mock-interview
description: Interactive mock interview with career-ops interview/practice: questions from the prep file and story bank, graded with feedback, gaps written back.
argument-hint: "<report number | company> [round]"
---

# /mock-interview → career-ops interview/practice

This command runs the embedded career-ops engine (`modes/interview/practice.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **interview/practice** (`modes/interview/practice.md`) interactively, one question at a time. Also grade each answer with the `interview-grader` agent (Three Laws) and save grades: `node os/cli.ts interview grades <job-id|-> mock '<json>'`.
