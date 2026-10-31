# Metro Line Map (future design)

> **Status:** spec and sketch only, not built. Sketch: `design/sketches/metro-line-map.html`.
> To build: add `desk/src/themes/metro.css` (imports `base.css`), register `metro` in `desk/src/world.ts`, and add the
> line-map component below as the navigation for the pipeline.

**The idea:** the pipeline is drawn as a Namma Metro / Delhi Metro line. Stages are stations, jobs are trains moving
toward Offer, and agent runs are the departures board. The line is the **real navigation**: clicking a station filters to
that stage. It is never decoration.

## Palette
| Token | Value | Job |
|---|---|---|
| `--w` / `--soft` | `#FFFFFF` / `#F5F4F7` | Ground / panels |
| `--ink` / `--ink2` | `#1A1A1A` / `#5C5C5C` | Text |
| `--rule` | `#E2E2E2` | Hairlines |
| `--line` / `--lineSoft` | `#7B2D8E` / `#EFE4F3` | **The purple line:** the pipeline track, the current station, primary actions |
| `--go` | `#00A651` | **Green line:** running agents, "departing" (in progress) states |

## Type
- **Barlow** (400–700) for UI and body, **Barlow Semi Condensed** (500–700) for station names and board headers:
  the voice of platform signage.
- Station counts in tabular figures; mono only for ids and times.

## Composition
- Top bar navigation. Across the top of the work area, a horizontal **line diagram**:
  `Sourced → Shortlisted → Needs referral → Awaiting you → Applied → Interviewing → Offer`, each station a roundel with
  its job count. The station holding work for you ("Awaiting you") is highlighted. Interchange markers show jobs that
  branched (a referral in flight on an applied job).
- Below, three columns: **today's queue** (left), **fresh matches** with source tags and Tailor (middle), and the
  **departures board** of agent runs (right), with a green dot while running.
- On phones the line goes vertical down the left edge (stations stacked) and the columns stack beneath.

## Signature move
**Click a station to travel there.** The stage filter animates along the line: a train marker slides to the station
and the lists below re-filter. Counts tick when agents move jobs between stations, and a job that just moved gets a brief
pulse at its new station. Under reduced motion it jumps without animating.

## Data it needs (beyond today)
- Stage counts and transitions already exist (`/api/stages`, `job_history`). Add a "moved in the last hour" query for
  the station pulse.

## Risks / don'ts
- Transit maps are a familiar dashboard trope. This only earns its place if the line *is* the stage navigation.
- No city-specific branding, logos or line names. Use generic purple and green.
- Don't draw jobs as trains or add any other transport ornament elsewhere on the screen.
