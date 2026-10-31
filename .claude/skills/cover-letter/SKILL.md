---
name: cover-letter
description: Cover letter with career-ops cover mode: researched company picture, mirrored keywords, gaps raised, 350–420 words, fact-checked against cv.md.
argument-hint: "<report number | desk job-id>"
---

# /cover-letter → career-ops cover

This command runs the embedded career-ops engine (`modes/cover.md`). Follow `playbook/engine-bridge.md` for paths, scripts,
truth rules and the desk hand-off.

Run career-ops **cover** (`modes/cover.md`) interactively: it has confirmation gates (company picture, keywords, four questions, draft approval) that need the user. Only render the PDF after the user approves the draft. Attach the result to the job's desk slip by noting the PDF path in your final message.
