# Resume rules (entry-level SWE, India)

## Non-negotiables
- **Every claim traces to `context/experience-library.md`.** Rephrase, reorder, re-emphasize: yes. Add a metric, tool,
  scope, ownership level or outcome that isn't there: never. Respect every "do NOT state / confirm" note in the library
  (fleet size, throughput, LLM ownership → "contributed to", fleet-wide fix not claimed).
- **Exactly one A4 page.** The renderer measures the PDF; if it reports 2 pages, cut the weakest bullets, don't shrink text.
- **ATS-safe by construction:** the template is single-column, real text, standard section names. Don't put content in the
  headline that isn't true of the candidate today.

## Output: `output/jobs/<id>/resume.json`
Same schema as `context/base-resume.json` (name, contact, headline, summary, sections[] of kind entries|skills|list).
Start from the base resume and change it; never start from scratch. `node os/cli.ts tailored <id>` renders
`resume.html`, `resume.md` (text twin for reviewers) and `resume.pdf`, and reports `pages`.

Formatting inside strings: `**bold**` only, on the **outcome/impact phrase or the JD-matching skill** in a bullet (1 per bullet,
2 max). No other markup, no emoji, no symbols beyond `·` `–` `→`.

## The tailoring method
1. **Read the JD like a hiring manager.** Extract: must-haves (explicit requirements), nice-to-haves, the real job
   (what this person will build in the first 6 months), seniority signals, domain, and the 10–15 weighted keywords
   (must ×3, nice ×2, stack mention ×1).
2. **Evidence map.** For each must-have: the best library line that proves it, or "no evidence". This map decides
   everything else and goes into `review.json`.
3. **Pick the positioning** (one of): Python backend · AI/LLM engineer · full-stack · platform/automation. It sets the
   headline, the summary's first clause, bullet order and skills order.
4. **Select.** Keep the 4–6 strongest Teleperformance bullets *for this JD* (cut the rest), 1 BT bullet (0 for AI roles
   if space is tight), 1–2 ReKart bullets (2 for full-stack), projects that prove a must-have. Total 11–15 bullets.
5. **Order.** The bullet answering must-have #1 goes first under the first role. Sections: Experience → Projects →
   Education → Skills → Certifications (move Projects above Experience only if a project is the strongest evidence).
6. **Rewrite each kept bullet:** `Strong verb + what you built + how (named tech from the JD where true) + why it mattered`.
   Mirror the JD's vocabulary where the evidence genuinely matches (JD "data pipelines" + library "data-processing
   workflows joining telemetry and logs" → "data pipelines joining telemetry and logs"). 18–32 words per bullet.
   No "responsible for", "worked on", "helped", "various", "etc.", "leveraged", "spearheaded".
7. **Headline + summary.** Headline: target title + 2–3 strongest JD-matching proofs. Summary: 2 sentences, ≤ 55 words,
   first clause names the role they're hiring for in their words; second names the strongest evidence. No adjectives
   about personality.
8. **Skills.** Re-order groups and items so JD must-haves appear first; drop items irrelevant to this role if space is
   tight; never add a skill without library evidence (the skills line counts as a claim).
9. **Coverage.** `Σ weight(keywords with real evidence present) / Σ weight(all) × 100`. Report covered/uncovered. Never
   raise coverage with unsupported keywords — gaps go to `review.json.gaps` with a suggestion for real evidence.

## Indian market specifics
- CGPA shown when ≥ 7.5 (8.04 ✓). Certifications only when relevant or space allows (IIT Ropar AI cert: always for AI roles).
- No photo, DOB, address beyond city, marital status, "Declaration".
- Notice period does not go on the resume.

## review.json
```json
{
  "positioning": "python-backend",
  "coverage": 0-100, "covered": [], "uncovered": [],
  "evidenceMap": [{ "requirement": "", "weight": 3, "evidence": "library line or null" }],
  "changes": { "added": [], "removed": [], "reworded": [{ "from": "", "to": "", "why": "" }], "reordered": "" },
  "reviews": [{ "reviewer": "recruiter|ats|hiring-manager", "score": 0-10, "verdict": "pass|fix" }],
  "changesFromReview": [],
  "gaps": [{ "requirement": "", "suggestion": "" }],
  "likelyQuestion": "",
  "pages": 1
}
```
