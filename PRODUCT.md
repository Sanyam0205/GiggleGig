# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
React + Vite for the desk (`desk/`), served by the zero-dependency Node orchestrator (`os/`) which also exposes the JSON + SSE API. SQLite (`node:sqlite`) is the single store.

## Users
One active candidate profile at a time. A resume upload starts a fresh candidate workspace and clears the previous candidate's job history. Candidate roles, experience level, location, and job-search preferences come from that candidate's resume and confirmed context. Separate concurrent candidate accounts are not implemented yet.

## Product Purpose
GiggleGig: Claude agents source roles from configured sources (ATS boards, LinkedIn/Indeed/Naukri/Glassdoor via JobSpy, Wellfound/Weekday/LinkedIn alert emails via Gmail, HN, remote boards, open web), score fit, tailor a truthful resume per role, review it with four reviewer agents, and draft outreach, referrals, interview prep and debriefs. The desk is where the candidate sees what agents did and approves everything before it leaves. Nothing is sent without approval.

## Positioning
Volume with precision under human control: agents do the legwork continuously, but every resume line traces to the experience library and every outbound action passes the owner's approval queue.

## Operating Context
- **Morning review (laptop, 20–30 min):** approve tailored resumes, send outreach, scan new matches.
- **Quick approvals (phone, same LAN):** approve/reject, copy a message, open a LinkedIn profile.
- **Watching agents live:** the desk stays open while a briefing or tailoring run streams steps.
- **Before an interview:** pull up prep, company research and past debriefs.
- Runs on the owner's Mac (`npm run desk`, localhost:4321); the phone reaches it over the LAN.
- Agents run headless through Claude Code on the owner's Claude subscription; Gmail and Google Calendar are connected.

## Capabilities and Constraints
- Pipeline stages: sourced → shortlisted / needs-referral / skipped → tailoring → awaiting-approval → approved → applied → referral-pending → referred → interviewing → offer → accepted | rejected | withdrawn. `filtered` = removed by the cheap pre-gate.
- Fit score 0–100 over five dimensions (stack, level, domain, company, logistics); <60 skip, 60–74 referral-only, ≥75 apply.
- Approval queue kinds: application, referral, connection (batch), hiring-manager, email, thank-you, followup. States: scheduled → pending → approved/rejected → done.
- Agents never send email, submit applications or message on LinkedIn. LinkedIn actions are draft + copy + open profile; email approvals create Gmail drafts.
- Agent runs (`runs`) stream tool-level events (`events`) the desk shows live.
- First screen answers "what needs me today": approval queue, due follow-ups, upcoming interviews; then pipeline and agent activity.

## Evidence on Hand
Real data only from the owner's search (`data/jobs.db`, `output/jobs/*`). No invented metrics, callback rates or testimonials on the desk.

## Product Principles
1. **Nothing leaves without the owner.** Approval is the primary act; make it fast and fully informed (resume diff, coverage, gaps, reviewer verdicts).
2. **Today first, archive second.** Lead with what is actionable now; history and stats are one step away, never in the way.
3. **Show the work.** Every agent result links to its run and steps so the owner can trust or correct it.
4. **Calm under stress.** A job search is stressful; no gamification, no cheerleading, no alarmist noise.
5. **Scannable, not sparse.** Dense enough that a morning review needs no hunting, structured enough that nothing is a wall of logs.

## Brand Commitments
- Must not read as a generic SaaS admin template (card grid of gradient KPIs, icon sidebar).
- Must not be gamified or cheerful (no streaks, confetti, motivational copy).
