---
name: career-ops
description: Run any career-ops mode from this project — ofertas (compare offers), training, project, upskill, titles, interview-redflag, expand, add, retro, outcome, scan, pipeline, triage, deep, latex, text, ats, master-profile, intake and the rest — against your engine-data/ profile and tracker.
argument-hint: "<mode> [args]"
---

# /career-ops <mode>

Follow `playbook/engine-bridge.md`. Then open `engine/career-ops/modes/<mode>.md` (or `modes/<group>/<mode>.md`) for the
mode in `$ARGUMENTS` and run it exactly as written. With no mode, list the modes from the Skill Modes table in
`engine/career-ops/AGENTS.md` with one line each, and suggest the three most useful right now from the tracker state
(`cd engine/career-ops && node stats.mjs --summary`).

Modes that change `cv.md`, `article-digest.md` or `profile.yml` (`add`, `expand`, `intake`, `master-profile`, `retro`)
always preview and ask before writing. After any mode that writes reports or tracker rows: `node os/cli.ts engine sync`.
