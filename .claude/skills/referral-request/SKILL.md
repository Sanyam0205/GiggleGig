---
name: referral-request
description: Referral ask for one job with career-ops contacto (internal-referral contact type), sequenced follow-ups, queued on the desk for approval.
argument-hint: "<desk job-id | report number> [contact name]"
---

# /referral-request → career-ops contacto

This command runs the embedded career-ops engine (`modes/contacto.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **contacto** with contact type `internal-referral` for the job, warm contacts first (`node contact-lookup.mjs --company "<name>"`, `node linkedin-join.mjs --company "<name>"`). Draft the ask plus two follow-ups (day 4, day 9) per `playbook/outreach-rules.md`.
Queue it: `{ "channel": "linkedin", "to", "profileUrl", "body", "sequence": { "step": 1, "next": [{ "afterDays": 4, "body" }, { "afterDays": 9, "body" }] } }` → `node os/cli.ts queue referral <job-id> "Referral ask · <name> @ <company>" <file>`.
