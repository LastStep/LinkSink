# T-0016 run 2: the Fable redesign spike

For the orchestrator, to fold into OPT-0003. Everything here is pictured from a real run of the spike on a copy of
the dev database; nothing was drawn by hand. The person judges.

**Where:** `/tmp/claude-1000/-home-rohan-Apps-LinkSink/1c6fe8b7-68f5-437e-b03a-9951b9ac25bc/scratchpad/T-0016/fable/`
(kept). `app/` is main at 91175e6 with the spike's changes; `data/` the copy; `shots/` the screenshots; `sheets/`
5 contact sheets; `measures.json` + `measures.md`; `data-changes.txt`; `RUN-LOG.md`; `shoot.mjs`, `peek.mjs`,
`measure.mjs`, `sheet.mjs`. To run it again: `cd app && npx vite dev --port 4810 --host 127.0.0.1`, sign in with
the copy's reset password (in the spike's RUN-LOG), open `http://127.0.0.1:4810/?design=f1`
(`current|f1|f2|f3`; `&row=r1|r2|r3`, `&ctl=c1|c2|c3` override; the choice sticks in localStorage until the next
`?design=`).

## The question and the decision

Which row layout, which status/priority control, and which frame, details and phone design LinkSink should build
next (the person's pick on OPT-0003, which this pass widens). The spike shows each candidate on the person's own 12
links; the measurements sit beside the pictures.

## Data

The dev database as it was at 20:46 UTC (12 live links, 3 tags, 3 projects), copied with SQLite's backup API on a
read-only connection; `data/media` copied. The earlier spike's copy was gone with its session's scratchpad, so the
changes were made again on the new copy, mirroring the first spike's shots: tags added (design, video, reading,
self-hosted, tools, ai, memory), 0 to 5 tags per link, two projects on three links, status on 9 of 12, priority on 8
of 12, both unset on "Rohan Yadav" and dribbble.com. The full list: `data-changes.txt`. The person's own
`data/linksink.db` was never written.

## The variants and the switch

`?design=` picks a bundle: a row, a control, and the one shared redesign of everything else.

| Switch    | Row (`?row=`)                                                                                                                                                                                                                                                                                                                                                                                  | Control (`?ctl=`)                                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `current` | today's row, untouched                                                                                                                                                                                                                                                                                                                                                                         | today's four-way segments                                                                                                                                                                                                     |
| `f1`      | **r1, columns:** a header line (Link · Tags · Projects · Status · Priority · Saved); tags as grey text, the first two and "+n"; projects as a dot, the first name and "+n"; status as a mark and a word; priority as bars and a word; an unset field is a faint dash. With the details open the Tags and Projects columns fold away (a container query at 900 px) so the title keeps its width | **c1, property rows:** Status and Priority as label-and-value rows under Source and Media, all four on one 32 px pitch; a click opens a menu of every choice and "No status"/"No priority"; arrows and Enter work, Esc closes |
| `f2`      | **r2, state first:** a fixed 100 px cell at the row's start holds the status word with its mark, then a priority mark (bars only), then the favicon and title; one grey line at the right holds the projects (dot and name) and the tags as text; nothing is cut to "+n" at 1440                                                                                                               | **c2, segments with marks:** a full-width track of three choices with their marks; the chosen one is white; pressing it again clears it, and an × after the track shows only while something is set                           |
| `f3`      | **r3, two lines:** the title over a second line of source, projects (dot and name) and tags as text; a fixed 124 px cell at the right holds the status over the priority, each with its mark                                                                                                                                                                                                   | **c3, radio lists:** Status and Priority side by side, each a list of four rows (none plus the three) with a radio and the mark                                                                                               |

The marks are one language across every screen (`StateMark.svelte`): status is an empty circle (To read), a half
circle (In progress), a green check (Done), a dashed circle (none); priority is one, two or three bars, three in the
negative red (High). They sit in the row, the details and the organiser alike.

**Shared by f1, f2 and f3** (one considered redesign of areas 3 to 5):

- **Details panel.** The preview, then the title as plain text that becomes a field on click (it wraps; today's is a
  one-line box that cuts long titles), the address under it. Source, Media, Status and Priority as one block of
  property rows (label 96 px, value), the selects drawn as text with a chevron, "auto" as a small grey word after
  the label. Tags and Projects as chips, 26 px. Description and Notes as borderless fields on the raised tone that
  turn white with a border on focus. The meta rows on a 28 px pitch. Organise / Archive / Delete in a footer pinned
  to the panel's foot, reachable without scrolling. On the phone the sheet gets a grab handle.
- **Frame.** The day's name sits on the ground above its card (13 px grey, the count fainter) instead of inside it;
  rows keep the 44 px pitch. The search field reads "Filter as you type" with a `/` key hint; in the spike it filters
  the list live (title, address, source, tags, projects) and the count turns into "3 of 12" (T-0009 builds the real
  one; this shows how it looks). Sidebar counts stay only on Unsorted (a queue); Tags and the projects lose theirs.
  Hover: the row tints and the three actions appear **in a slot of their own, 80 px, after the time**, never over it.
  Selected: the active fill plus a 2 px accent bar inside the left edge; open: the active fill alone. Empty states in
  the product's words, in a framed card: "Nothing waiting. Every link has a tag or a project…", "No links carry this
  tag yet. Paste a link on this page and it is tagged as it is saved.", "Nothing matches “…”".
- **Phone (390).** One row for all three variants: favicon, the title on up to two lines, the time at the right, and
  a second line of status (mark and word, in ink), priority, source, projects and tags, where **whole items drop when
  they do not fit** (a wrapping line clipped to one row), so nothing is cut mid-word. The sidebar becomes a bottom bar
  of Links · Unsorted (with its count) · Projects · Tags · More; the top bar keeps the mark and the screen's name,
  and the page's own h1 goes (it was shown twice). The details and the organiser rise as sheets.
- **Dark mode.** Favicons sit on a pale 20 px tile (`--icon-tile`), so GitHub's black mark reads; in light the tile
  is invisible.

## Measurements

From `measure.mjs` (`getBoundingClientRect` on every `li.row` and on each row's status cell, Chromium, light,
`/?design=…`), merged in `measures.json`; rows per screen is computed, since 12 links do not fill 900 px.

| Measured (Chromium, light, the 12 links)                                   | current | f1 (r1) | f2 (r2) | f3 (r3) |
| -------------------------------------------------------------------------- | ------- | ------- | ------- | ------- |
| Row height at 1440, px                                                     | 44      | 44      | 44      | 56      |
| Rows per 1440×900 screen, floor((900 − first row's top) / row height)      | 14      | 14      | 15      | 11      |
| Distinct left edges of the status cell across the rows that show one, 1440 | 7       | 1       | 1       | 1       |
| Row height at 390, px (one-line title / two-line title)                    | 60/62   | 60/80   | 60/80   | 60/80   |
| Rows per 390×844 screen, with the first row's height                       | 9       | 10      | 10      | 10      |

f1's first row starts 28 px lower than f2's because of the header line; f2 fits one more row than today, f3 three
fewer. The first spike measured 8 status edges on today's row; this copy has one fewer row with a status, so 7.

**First-load JS** (`ORIGIN=http://127.0.0.1:4810 npx vite build`, then `npx size-limit` in `app/`, the project's own
`.size-limit.js`): `/` **55.77 kB gzipped** (login 46.94, signup 46.99). STATE says main is 52.04 KB (said; main was
not rebuilt, which would mean writing inside the repository). The +3.7 kB is an upper bound: the spike's LinkList
carries today's row markup and the redesigned one side by side, plus the switch and the marks; a build of one chosen
row would carry one.

## Shots

`shots/<state>-<design>-<width>-<theme>.png`, states: `list`, `hover` (1440), `detail-set` (Stop Building AI Agents:
In progress, High), `detail-unset` (dribbble.com), `detail-ctl-open` (c1's menu, f1 only), `picker`,
`picker-values` (the organiser scrolled to Status/Priority), `select` (three rows), `search` ("book" typed),
`empty-unsorted`, `empty-tag` (`/tags/__none__`), `nav` (390). Plus `list-<design>-390-light-webkit.png` for all four.
Contact sheets, one per area: `sheets/sheet-rows.png`, `sheet-controls.png`, `sheet-details.png`,
`sheet-frame.png`, `sheet-phone.png`; the file name sits under every tile.

What they show, in plain words: in every redesigned row the status starts on one line down the list, and an unset
field shows a dash where today it shows nothing. r1 reads as a table with a header; r2 puts the state before the
title, so the first thing on each row is its state, and the title moves 130 px right; r3 is the only one where every
tag and project name is readable at 1440 without "+n", at the cost of taller rows. On the phone all three look the
same. c1 is the shortest panel; c2 shows all three choices with one click to change; c3 shows all four choices
including "none" and is the tallest.

## Where the language departs from Ledger (ADR-0003, `design/reference/`)

- **Marks beside words** for status and priority (a circle, bars). Ledger used words in pills; the pills are gone
  from the row (status is a mark and a word in ink, Done's check green, High's bars red). The colour budget stays
  under the sheet's 1%: two small marks per row at most.
- **Day headings on the ground**, outside the card, rather than inside the card's top.
- **Borderless fields in the details** (title, description, notes on the raised tone; selects as text) where Ledger
  drew boxed inputs. Boxes remain on the paste bar and the search field.
- **A 2 px accent bar** on a selected row (from the taste skill's inbox pattern); Ledger marked selection by fill only.
- **A bottom tab bar on the phone**; Ledger's phone had a top bar and a menu sheet. The sheet stays behind "More".
- **Sidebar counts dropped** from Tags and the projects.
- Two tokens added to `tokens.css`: `--icon-tile` (transparent / #e4e5e8) and `--meta` (#6b7079 / #9a9ea6, a
  lighter grey for a row's second line). Geist is served as in main.

## What did not work, and what was not run

- The first scripted click on a row's time cell **archived the link** (the hover Archive button covers the time in
  today's row): the trap reproduced, the copy restored, the script opens rows with a synthetic click since.
- Better Auth's sign-in rate limit refused one login after several in a row; the scripts now sign in once and reuse
  the session (`auth.json`).
- The first full run died at the phone nav step (the Menu button is hidden under the redesign); resumed with filters.
  The f1 1440 shots were reshot at the end; a tile that reads "missing" on a sheet names a file that was not produced.
- c1's popover closes on blur only; c2's "press again to clear" is not discoverable without the ×. Spike shortcuts,
  not proposals.
- The r1 header line is not sticky; a long list scrolls it away.
- **Not run:** WebKit beyond the four 390 light list shots; the taste skill's `inspect.mjs --app` gate (time); hover
  on the phone (no hover there); the real search (T-0009); any sim of the person's preference. Nothing here says
  which variant is better.

## Cost

About 130 minutes wall clock of a 150-minute budget; one builder session (Fable).
