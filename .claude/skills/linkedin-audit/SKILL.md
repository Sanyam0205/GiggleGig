---
name: linkedin-audit
description: Compare the user's LinkedIn profile against their target JDs and give specific before/after edits for headline, about, experience, skills and featured.
argument-hint: "[LinkedIn URL or pasted profile text]"
---

# /linkedin-audit

1. Get the profile: pasted text or PDF export (LinkedIn → More → Save to PDF) is most reliable; a public URL may not be fetchable — ask for the export if WebFetch fails.
2. Aggregate keywords from the last 30 shortlisted jobs: `node os/cli.ts keywords --status shortlisted,awaiting-approval,applied --limit 30`.
3. Audit, each with **Before → After** and why:
   - **Headline** (≤ 220 chars): role + stack + strongest proof, recruiter-search keywords first ("Software Engineer | Go, Kafka, Postgres | Built X used by Y").
   - **About**: 3 short paragraphs — what you build, proof, what you're looking for (with "open to SDE-1 roles in Bengaluru/remote").
   - **Experience/Projects**: bullets aligned to the library, with numbers.
   - **Skills**: top 5 pinned = most frequent JD keywords with real evidence.
   - **Featured**: best project, work products, a technical post.
   - **Open to Work**: recruiter-only setting; correct titles + locations.
4. Only use facts from the experience library. Write the result to `output/linkedin-audit.md`.
