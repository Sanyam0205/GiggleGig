---
name: negotiate
description: Offer review with career-ops offer-prep: clause-by-clause walk, missing and inconsistent items, lawyer questions and items to raise, plus INR negotiation scripts from your profile.
argument-hint: "<report number | desk job-id> [offer file]"
---

# /negotiate → career-ops offer-prep

This command runs the embedded career-ops engine (`modes/offer-prep.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **offer-prep** (`modes/offer-prep.md`); it describes, never judges. Add `/salary-research` for Indian market bands and the negotiation scripts in `engine-data/modes/_profile.md` (fixed vs variable, joining bonus, notice buy-out). Queue any reply draft on the desk (`node os/cli.ts queue email <job-id> "Negotiation · <company>" <file>`).
