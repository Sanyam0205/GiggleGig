---
name: connection-request
description: LinkedIn connection notes with career-ops contacto: warm contacts first (linkedin-join.mjs on your Connections.csv), then hiring manager → recruiter → peer, 3-sentence notes within the character limit. Drafts go to the desk queue.
argument-hint: "[company | report number] [count]"
---

# /connection-request → career-ops contacto

This command runs the embedded career-ops engine (`modes/contacto.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **contacto** (`modes/contacto.md`) for each target company (start from jobs at score ≥ 3.5: `node os/cli.ts find --status shortlisted,needs-referral`). Check warm paths first with `cd engine/career-ops && node linkedin-join.mjs --company "<name>" --summary` (needs `engine-data/data/Connections.csv`).
Never send. Queue the batch for approval: `{ "items": [{ "name", "company", "role", "profileUrl", "note", "why" }] }` → `node os/cli.ts queue connection - "Connection batch · <n> people" <file>`; add each person with `node os/cli.ts contact add …`.
