---
name: quick-start
description: Paste any job URL or JD: career-ops two-pass triage, then (if it passes) the full auto-pipeline — A–G evaluation report, tracker row, and a desk entry.
argument-hint: "<job URL or pasted JD>"
---

# /quick-start → career-ops auto-pipeline

This command runs the embedded career-ops engine (`modes/auto-pipeline.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **auto-pipeline** (`modes/auto-pipeline.md`) on `$ARGUMENTS`, with PDF generation skipped (tailoring is manual: the user presses Tailor on the desk).
Before the full evaluation, run the **triage** first pass (`modes/triage.md`, reading only `engine-data/modes/_brief.md`) and show its TRIAGE line. If it is FAIL or SKIP, stop there unless the user says to continue.
After the report is written and merged, run `node os/cli.ts engine sync` so the desk shows it, then give: score / decision / confidence, the 3 critical requirements with ✓/✗, the next action, and the report path.
