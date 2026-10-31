# Speed Post Counter — backup design (implemented)

> Status: **built and selectable** (Sources → Desk look → Speed Post Counter). Theme file: `desk/src/themes/speedpost.css`
> (all rules in `desk/src/themes/base.css`). Original decision sketch: `.impeccable/mocks/decision/assigned.html`.

The desk is an India Post speed-post counter: agents **book** outbound items as slips, the owner **franks** them with a
violet date stamp, and every slip tracks **Booked → Franked → Dispatched → Delivered**. The world contributes only type,
palette, density and that one signature move; navigation, tables, tabs and buttons stay standard web controls.

Source of truth: `desk/src/themes/base.css` (tokens on `:root`).

## Palette
| Token | Value | Job |
|---|---|---|
| `--buff` | `#F4EDE1` | Ground: the buff of postal forms |
| `--buff-2` | `#EBE2D2` | Slip stubs, hovered ghost buttons |
| `--paper` | `#FBF7EF` | Slips, inputs, panels |
| `--ink` | `#1F1D1B` | Text, rules, primary buttons, the rail |
| `--ink-2` / `--ink-3` | `#57514A` / `#7A7268` | Secondary / tertiary text |
| `--rule` / `--rule-soft` | `#CFC4B1` / `#E0D7C7` | Hairlines, dashed perforations |
| `--red` | `#C62828` | Post-box red: **urgency only** (the reversed plate, needs-referral, errors, live dot) |
| `--violet` | `#4E3D8F` | Stamp-pad violet: **what you approved** (Approve button, stamp, tracking progress, focus, selection) |
| `--green` | `#2F6B3A` | Positive pipeline states (interviewing, offer, warm contacts) |

Red and violet never decorate. If an element isn't urgent or approved, it is ink on buff.

## Type
- **Archivo** (400–800): UI and headings. Page titles 30px/800, slip titles 19px/700, body 14px.
- **Archivo Narrow** 600, uppercase, +0.06em: labels, tags, tracking steps (≥ 11px).
- **IBM Plex Mono**: only for consignment numbers, timestamps, counts and event logs (data, never costume).
- Rank by weight and scale contrast on a strict baseline; tabular numerals for every figure.

## Composition
- 84px ink rail (bottom tab bar under 760px) + work area on a visible 12-cell grid (faint column bands).
- Today: queue in cells 1–8, dispatch log in 9–12 (stacks under 1180px).
- **One reversed red plate per screen**: the single most urgent pending item.
- Slips: stub (kind, consignment no., fit) | perforation | body (title, facts, tracking) | actions. Approve primary and violet;
  Reject outline-only, isolated by space below, turns red only on hover/focus.
- Detail opens as a right sheet (full screen on phone), never a modal for routine review.

## Signature motion
The stamp lands once when an item is franked: scale 1.5 → 1, rotate −4° → −14°, blur 2px → 0, 420ms expo-out.
`prefers-reduced-motion` shows it in place. No other entrance animations.

## Don'ts
No KPI card grids, gradient text, eyebrow labels, emoji icons, confetti, streaks or motivational copy.
Icons are the 1.6px-stroke set in `desk/src/parts/Icon.tsx`.
