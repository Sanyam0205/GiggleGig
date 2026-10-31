---
name: weekly-retro
description: Weekly review with career-ops patterns, calibrate and funnel velocity: rejection patterns, whether scores predict outcomes, score threshold and targeting recommendations.
argument-hint: "[week start YYYY-MM-DD]"
---

# /weekly-retro → career-ops patterns + calibrate

This command runs the embedded career-ops engine (`modes/patterns.md`, `modes/calibrate.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **patterns** (`modes/patterns.md`, needs ≥ 5 sent applications) and **calibrate** (`modes/calibrate.md`, advisory), plus `cd engine/career-ops && node funnel-velocity.mjs --summary` and `node stats.mjs --summary`. Add the desk's own funnel: `node os/cli.ts retro <week-start>`. Keep the summary under 15 lines; write the full report to `engine-data/reports/pattern-analysis-<date>.md` as the mode does.
