---
name: app-tracker
description: Pipeline status and updates on the career-ops tracker: tracker mode, follow-up cadence, reply-watch for employer emails, closing-soon and stale rows.
argument-hint: "[status | update <natural language>]"
---

# /app-tracker → career-ops tracker + followup + reply-watch

This command runs the embedded career-ops engine (`modes/tracker.md`, `modes/followup.md`, `modes/reply-watch.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

**Status:** `cd engine/career-ops && node stats.mjs --summary`, `node followup-cadence.mjs`, `node closing-soon.mjs --summary`, plus `node os/cli.ts pipeline` for the desk's queue. Give the top 3 actions as exact commands.
**Update:** apply the user's sentence with `node set-status.mjs --report <N> <State> --note "…"` (canonical states only: Evaluated, Applied, Responded, Assessment, Interview, Offer, Hired, Rejected, Discarded, SKIP); confirm ambiguous matches first (`node find.mjs "<company>"`). For employer emails, use **reply-watch** (`modes/reply-watch.md`).
