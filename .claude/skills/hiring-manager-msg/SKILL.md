---
name: hiring-manager-msg
description: Hiring-manager outreach with career-ops contacto (hiring-manager contact type) or an application email with email mode; drafts queued on the desk.
argument-hint: "<desk job-id | report number>"
---

# /hiring-manager-msg → career-ops contacto + email

This command runs the embedded career-ops engine (`modes/contacto.md`, `modes/email.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

For LinkedIn, run career-ops **contacto** with contact type `hiring-manager`. For email, run **email** (`modes/email.md`, draft-only). Queue the draft on the desk (`node os/cli.ts queue hiring-manager <job-id> "<Name> · <Company>" <file>`, with `channel` linkedin or email). Approved emails become Gmail drafts; nothing is sent automatically.
