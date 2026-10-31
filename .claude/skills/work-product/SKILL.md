---
name: work-product
description: One-page analysis of the company's product or engineering with specific, non-obvious recommendations — the strongest outreach hook. Types — get-interview, in-process, post-interview recovery.
argument-hint: "<job-id | company> [get-interview|in-process|recovery]"
---

# /work-product

A new grad's work product proves they can think about *this* company's problems. For SWE: a teardown of a feature's likely architecture, a performance/UX audit of their web app, a small open-source contribution or prototype, or an analysis of their public API/SDK.

1. Read the JD, company research (`/company-research` first if missing), and the experience library (to choose an angle that showcases real strengths).
2. Pick the angle that intersects (their likely pain) × (the user's real skills). Examples:
   - Lighthouse/Web Vitals audit of their product with 3 prioritized, specific fixes.
   - "How I'd design <their feature>": requirements, API, data model, scaling notes — plus where their public behaviour hints at the current design.
   - SDK/API DX review: setup friction, error messages, docs gaps, with a PR or snippet.
   - A tiny prototype using their public API.
3. Write `output/jobs/<id>/work-product.md` — one page: hook (1 line) → what I looked at → 3 findings with evidence → recommendations → what I'd build next. Everything checkable; no invented internal facts — label inferences.
4. Run the `hiring-manager-reviewer` agent on it; fix factual issues.
5. Type-specific framing:
   - **get-interview:** pairs with `/hiring-manager-msg`.
   - **in-process:** send to the recruiter before the next round as "something I put together after our conversation".
   - **recovery:** after a weak interview round, revisit the question you fumbled with a better, concrete answer.
