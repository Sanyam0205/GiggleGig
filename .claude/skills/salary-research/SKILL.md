---
name: salary-research
description: Market compensation for a specific company, role, level and location from levels.fyi, Glassdoor, AmbitionBox, Blind and LeetCode Discuss compensation threads, with sources and confidence.
argument-hint: "<company> [role] [level] [city]"
---

# /salary-research

1. Defaults from the career plan: Software Engineer, entry level (SDE-1 / L3 / E3 equivalent), the target city.
2. Research (WebSearch/WebFetch) and record each data point with source, date and sample size:
   - levels.fyi (company + level + India), Glassdoor India, AmbitionBox, Blind, LeetCode Discuss "compensation" posts, Weekday/Instahyre salary insights.
   - For global remote: USD bands, whether paid via EOR/contractor, and the INR equivalent after typical contractor taxes.
3. Write `output/salary/<company>.md`:
   - **Fixed / base** (INR LPA) p25–p50–p75 · **variable/bonus** · **joining bonus** · **ESOPs/RSUs** (vesting, cliff, refreshers) · **total first-year**.
   - Company's level mapping (e.g. SDE-1 ≈ L3), how negotiable new-grad offers typically are there.
   - Confidence: high/medium/low, and why.
4. Never present a single number as fact; always a range with sources.
