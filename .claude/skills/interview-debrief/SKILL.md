---
name: interview-debrief
description: Debrief a real interview with career-ops interview/debrief: every question categorized and scored, gaps closed, story bank updated; thank-you note drafted.
argument-hint: "<report number | company> <transcript path or text>"
---

# /interview-debrief → career-ops interview/debrief

This command runs the embedded career-ops engine (`modes/interview/debrief.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **interview/debrief** (`modes/interview/debrief.md`) on the transcript, then `/thank-you-note` for the follow-up. Save grades with `node os/cli.ts interview grades <job-id> <round> '<json>'` and move the tracker with `set-status.mjs` if the round changed status.
