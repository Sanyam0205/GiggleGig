---
name: thank-you-note
description: Thank-you email within 24 hours that references specific moments from the conversation, not "thanks for your time". Queued as a Gmail draft for approval.
argument-hint: "<job-id> [interviewer name] [moments or transcript]"
---

# /thank-you-note

1. Use the debrief (`output/jobs/<id>/debrief-*.md`) or the moments the user gives. Get the interviewer's name/email from the calendar event if available (Google Calendar) — never guess an email.
2. Write ≤ 120 words: thanks + one specific technical moment ("the trade-off you raised about caching invalidation on the order book") + a short, true follow-up thought or link that adds value + one line of continued interest.
3. Queue: `{ "channel":"email", "to":"...", "subject":"Thank you — <round> for <role>", "body":"..." }` → `node os/cli.ts queue thank-you <id> "Thank-you · <name>" <file>`. On approval the desk creates the Gmail draft.
