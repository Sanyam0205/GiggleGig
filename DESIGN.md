# Design: Placement Notice Board (current)

Every role is posted like a college T&P-cell **drive notice**, and its **eligibility is ticked line by line against your
profile**. The fit score becomes something you can audit. Approvals read as the **shortlist awaiting your sign-off**,
sized to a daily time budget. The world contributes type, palette, density and that one signature move. Navigation,
tables, tabs and buttons stay standard web controls.

- **Theme file:** `desk/src/themes/notice.css` (imports the shared structure in `desk/src/themes/base.css` and remaps its tokens)
- **Notice components:** `desk/src/parts/Notice.tsx` (`NoticeList`, `Eligibility`); the notice-board Today is in `desk/src/views/Today.tsx` (`NoticeToday`)
- **Selecting a look:** Sources → Desk look (stored per browser; `desk/src/world.ts`; the default is `notice`)
- **Sketch:** `design/sketches/placement-notice-board.html`

## Other designs
| Design | Status | Spec |
|---|---|---|
| Placement Notice Board | **current** | this file |
| Title Card Wall | built, selectable | [design/title-card-wall.md](design/title-card-wall.md) |
| Speed Post Counter | **backup**, built, selectable | [design/speed-post.md](design/speed-post.md) |
| Metro Line Map | future: spec + sketch, not built | [design/metro-line-map.md](design/metro-line-map.md) |

Adding a look: create `desk/src/themes/<name>.css` that `@import`s `base.css` and overrides tokens and signature rules,
register it in `WORLDS` in `desk/src/world.ts`, and branch on `getWorld()` where the look needs its own structure
(see `Today`, `Matches`, `Companies`, `Slip`, `DispatchLog` and the shell in `App`).

## Palette: two inks on paper, no third accent
| Token | Value | Job |
|---|---|---|
| `--buff` (paper) | `#FAF8F2` | Page ground, the notice sheet |
| `--buff-2` | `#F1EEE4` | Sunk panels: nav selection, slip stubs, agent register |
| `--paper` | `#FFFFFF` | Slips, inputs, documents |
| `--ink` / `--ink-2` / `--ink-3` | `#1B2A4A` / `#4A5672` / `#6F7891` | Printed navy text, secondary, tertiary |
| `--rule` / `--rule-soft` | `#D9D4C6` / `#E7E3D8` | Hairlines |
| `--violet` → **Reynolds blue** | `#1F4FB2` | Eligibility ticks ✓, primary actions (Tailor, Approve), focus, links, evidence rule, live run |
| `--red` → **maroon** | `#8C1D2C` | The sign-off seal, unmet criteria ✗, counts in the nav, urgency |

base.css still calls these tokens `violet` and `red`; the notice theme reassigns their values. Anything that is neither
eligibility, action, nor sign-off stays navy on paper.

## Type
- **Source Serif 4** (600–700): page titles (30px/700), notice titles (18px/600), slip titles, section and sheet headings.
  It carries the authority of a printed notice.
- **IBM Plex Sans** (400–600): UI, body (14px), tables, controls. Labels are 11.5px/600 with +0.06em tracking.
- **IBM Plex Mono** only for ids, timestamps, slip minutes and the run axis. Tabular figures for every score and figure.

## Composition
- **Shell:** a 208px left list nav with the masthead "GiggleGig · <name>". The current item has a
  3px navy inset bar; counts are maroon mono. On phones the nav becomes a horizontal scroller and the masthead hides.
- **Today:**
  1. "Drives this week": notice entries for new matches.
  2. "Shortlist — awaiting your sign-off": approval slips under the **time-budget bar** (25 minutes by default; signed
     minutes in navy, remaining in blue, overflow in maroon with "the rest can wait for tomorrow").
  3. Follow-ups due and next interview.

  The agent register sits in a tinted right column.
- **Notice entry** (grid: 64px score | body | 220px side):
  - **Score:** large serif number with "FIT" under it.
  - **Body:** serif title, then company · location · warm path, then the **eligibility row**, then the **evidence line**
    (a 1px blue rule on the left; the library proof in bold).
  - **Side:** pay (posted or estimate), "via" sources, and Tailor resume (blue at 75+, outline below).
- **Matches** defaults to notice entries, with a Notices/Table toggle; company pages list their roles as notices.
- **Slips:** stub (kind, consignment id, fit, **minutes**), body, actions. Approve is blue; Reject is outline and set apart.

## Signature move: the eligibility row
4–6 checks per role, as on a campus drive notice:
- an academic cut-off (if the JD names one)
- experience band vs required
- the 2–3 must-have skills
- location or remote
- any dealbreaker from the career plan

They render as a blue ✓ when met, a maroon ✗ when not, and a grey ? when the JD is silent. The scorer returns them as
`eligibility: [{ criterion, status: met | unmet | unknown }]` together with an `evidence` sentence (see
`playbook/fit-rubric.md`). Roles scored before this existed fall back to their five fit dimensions shown as pass/fail.

## Sign-off seal and motion
An approved slip gets a maroon double-ring seal ("SIGNED · date · time"), rotated −10°. It lands once, scaling from
1.4 to 1 and rotating −2° to −10° over 380ms (expo-out), and appears in place under `prefers-reduced-motion`. Agent runs
in the register are drawn **to their real duration on one shared minute axis**: navy when finished, blue while
running, maroon when failed or stopped. No other animation.

## Don'ts
- No cork, pushpins, torn paper, typewriter fonts or college crests: no nostalgic pastiche.
- Seal and ink marks appear only on eligibility and sign-off state.
- No third accent colour, no gradients, no KPI card grids, no eyebrow labels.
