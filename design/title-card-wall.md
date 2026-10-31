# Title Card Wall (built, selectable)

> Status: **built**. Switch under Sources → Desk look → Title Card Wall. The current design is Placement Notice Board (see `DESIGN.md`).

The desk is a dark streaming home screen for the job search: matches sit in **rows of company tiles**, and the tile you
focus **expands in place and lifts** while the rest of the wall dims. The world contributes type, palette, density and
that one signature move. Navigation, tables, tabs, forms and buttons stay standard web controls, so the screen works as
a tool before it looks like anything.

- **Theme file:** `desk/src/themes/wall.css` (imports the shared structure in `desk/src/themes/base.css` and remaps its tokens)
- **Wall components:** `desk/src/parts/Tiles.tsx` (`Wall`, `matchRows`)
- **Selecting a look:** Sources → Desk look (stored per browser; `desk/src/world.ts`)
- **Sketch:** `design/sketches/title-card-wall.html`

## Palette
| Token | Value | Job |
|---|---|---|
| `--buff` (ground) | `#0E1116` | Page background |
| `--buff-2` | `#151A21` | Sunk surfaces: inputs, stubs, empty states |
| `--paper` (tile) | `#1C222B` | Tiles, slips, panels |
| `--tile-hi` | `#232A35` | Hovered panels |
| `--ink` / `--ink-2` / `--ink-3` | `#F5F5F5` / `#A9B1BE` / `#7A8291` | Text, secondary, tertiary |
| `--rule` / `--rule-soft` | `#2A313C` / `#222831` | Hairlines |
| `--red` | `#E50914` | **The single accent:** primary action (Tailor, Approve), focus outline, live indicator, active tab |
| `--green` | `#46D369` | Fit scores ("78 fit"), positive states, warm paths |

Rules:
- **Company tiles carry the colour.** Each company gets a stable two-stop tint (`hsl(h 32% 26%) → hsl(h+28 28% 15%)`,
  with the hue hashed from the name), and the company name is set large as the tile's artwork. No logos, no photos.
- **Red is rationed** to actions and focus. Never use it for decoration or for a whole region.
- **Default buttons are white** (the "Play" button), primary actions are red, secondary ones are outline.

## Type
- **Figtree** 400–800 for everything. Page titles 28px/800 at −0.02em; row titles 18px/700; tile company names 26px/800
  (34px when focused) at −0.025em; body 14px.
- Labels and tags are sentence case at 12px/600, never uppercase-tracked.
- **IBM Plex Mono** only for ids, timestamps and event logs. Tabular numerals for every score and figure.

## Composition
- **Shell:** a sticky 64px top bar with the brand, text navigation (Today · Matches · Companies · Pipeline · Sources ·
  Agents · Contacts · Interviews), a pending count on Today, and **company search** on the right (Enter searches that
  company for feasible roles).
- **"Awaiting you" strip** under the bar whenever approvals are pending: the count, up to 3 items, and Open queue.
- **Matches = rows** (with a Rows/List toggle; List is the dense sortable table):
  For you (≥ apply threshold) · Need a referral first · Fresh today · You know someone there · On <platform> × 4.
- **Today** keeps the queue-first layout. The most urgent item is a focused panel with a red outline; slips are dark
  panels; new matches show as a tile row.
- **Company pages** show a tile row of roles above the full table; warm paths and the research brief sit in the side column.
- Content padding is 40px on desktop and 16px on phone; rows are 26px apart; tiles are 248 × ~180px with a 14px gap.

## Signature motion
Focusing a tile (click, or Enter on keyboard) replaces it with a 540px expanded card: fit, pay, sources, warm paths,
rationale, and Tailor / Open / Posting. It scales in from 0.96 over 280ms (expo-out). Its row lifts 3px and every other
row drops to 42% opacity. Escape closes it. Under `prefers-reduced-motion` nothing animates; the expansion just appears.

## Phone
The top bar scrolls horizontally and search is hidden (use the Companies tab). The awaiting strip shows one item.
Tiles are 200px wide; the focused tile goes full width and stacks.

## Don'ts
- Don't use poster imagery or logos.
- Don't use gradient text, KPI card grids or eyebrow labels.
- Don't use red outside actions and focus.
- Don't autoplay or carousel the rows.
- Don't hide the approval queue behind browsing: the strip always shows pending approvals.
