---
id: OPT-0003   # an options write-up; every field and how to fill it: skill workflow:options
title: How should a Ledger row show tags, projects, status and priority, and how should the details set status and priority?
lane: director
status: open
author: orchestrator
created: 2026-10-24
decided: null
chosen: null
---

# How should a row show tags, projects, status and priority, and how should the details set status and priority?

## Why this is being asked now

After testing T-0008 you said the row ("link - tags - project dot - status - priority") looks misaligned, and that
the status and priority controls in the details need better components. T-0009 (search, filters and keys) changes
the same list screen, so it waits for this choice. Every picture below comes from a throwaway spike (T-0016) running
on a copy of your dev database: your 12 links, with extra tags, statuses and priorities added on the copy only.
Spike report: M-2026-10-24-667c7ac1.

Pictures, in `design/options/T-0016/`:

- **Rows:** `sheet-rows.png` shows every row variant at 1440 and 390 px, light and dark. `row-<a|b|c|current>-1440-light.png` is each one at full size.
- **Controls:** `sheet-controls.png` shows every control variant. `ctl-<a|b|c|current>-1440-light-set.png` is each one at full size, and `-unset.png` the same with nothing set.

This page asks two questions. Answer each with a letter, for example "rows A, controls C".

## Second pass: the Fable redesign (added 2026-10-24 20:50 UTC)

At 20:14 you asked for "a fable redesign on this and improve everything if possible". A builder on the Fable model
ran a second spike on a fresh copy of your dev database (report M-2026-10-24-d34fa073, full text in
`design/options/T-0016/fable/REPORT.md`, key shots beside it). It keeps Ledger's calm, dense, text-first spirit and
offers three bundles behind one switch:

- **f1:** row **r1**, columns under a header line, with status and priority as a mark and a word. Control **c1**:
  property rows, where a click opens a menu.
- **f2:** row **r2**, state first. A fixed cell at the row's start holds the status word and mark, then the priority
  bars, then the title, with projects and tags in grey on the right. Control **c2**: a track of three choices with
  marks, one click to change, and an × to clear.
- **f3:** row **r3**, two lines, with status over priority in a fixed cell on the right. Control **c3**: radio lists.

Rows and controls mix freely (`?row=r1&ctl=c2`). One shared redesign sits under all three:

- **Marks:** one language everywhere. Status is ○ To read, ◐ In progress, ✓ Done (green) and a dashed circle for
  none; priority is 1 to 3 bars, with High in red.
- **Details panel:** the title wraps instead of being cut. Source, Media, Status and Priority are one block of
  label and value rows. Fields have no borders until you click them. The Organise / Archive / Delete footer is pinned
  to the bottom of the panel.
- **The list frame:** day names sit above their card. The search reads "Filter as you type" with a `/` hint, and
  the count turns into "3 of 12" while you filter (it shows the look; the real search is T-0009).
- **Hover:** the Archive, Tag and Delete actions get their own slot after the time, so a click on the time never
  archives.
- **Selection:** a selected row gets a 2 px accent bar.
- **Empty states:** written in plain words.
- **Dark mode:** favicons sit on a pale tile, so GitHub's icon shows.
- **Phone:** a bottom tab bar (Links · Unsorted · Projects · Tags · More). Rows show the title on up to two lines and
  a second line where whole items drop when they don't fit, so nothing is cut mid-word.

Where it departs from Ledger:

- Marks beside the words, instead of status pills.
- Day names outside the card.
- Borderless fields in the details panel.
- The accent bar on selected rows.
- A bottom tab bar on the phone.
- No counts beside Tags and the projects in the sidebar (Unsorted keeps its count).

| Measured (Chromium, light, your 12 links) | today | f1 (r1) | f2 (r2) | f3 (r3) |
|---|---|---|---|---|
| Row height at 1440, px | 44 | 44 | 44 | 56 |
| Rows per 1440×900 screen | 14 | 14 | 15 | 11 |
| Different left edges of status | 7 | 1 | 1 | 1 |
| Rows per 390×844 phone screen | 9 | 10 | 10 | 10 |

Shots, in `design/options/T-0016/fable/`:

- `list-<current|f1|f2|f3>-1440-light.png` and `detail-set-<…>-1440-light.png`: each list and its details panel.
- `list-f1-390-light.png`: the phone.
- `hover-f1-1440-light.png`, `search-f1-1440-light.png`, `select-f1-1440-light.png` and
  `empty-unsorted-f1-1440-light.png`: the hover, search, select-mode and empty-Unsorted states.

**First load:** the spike's build is 55.77 KB against main's 52.04 KB (limit 60). That figure is an upper bound,
since the spike carries both rows and the switch.

Not run:

- WebKit, apart from four phone shots.
- The taste skill's inspection gate.
- The real search.

Known spike shortcuts, not proposals: c1's menu closes only on blur, and r1's header line isn't sticky.

## What matters here

- **Alignment:** each kind of information sits in the same column on every row. This was your complaint.
- **How much shows at a glance:** rows per screen, and whether you can read status and priority without learning
  symbols.
- **Phone width:** what holds up at 390 px.

## Question 1: the row

### A. Columns

A header line (Link · Tags · Projects · Status · Priority · Saved), with every column at a fixed width on every row.
Tags show as the first two chips plus "+n", and projects as a dot, the first name and "+n". An empty field shows a
faint dash. Status is a word in a small pill; priority is a flag and a word, with High in red.

- **Gets us:** status starts at the same left edge on all 12 rows (today it starts at 8 different places). Labels are
  in plain words, and the row is the same height as today's.
- **Costs:** long tag lists are cut to "+n". At 390 px it falls back to a two-line row, much like today's.
- **Reversible?** Yes. It's a change to the row only, and nothing is stored differently.

### B. Glyph slots

Two small marks at the start of each row: priority as 1 to 3 bars (High in red) and status as a circle (empty To
read, half In progress, green check Done, dashed for none). Then the title, tags as plain comma text, project dots,
and the source and time at the right.

- **Gets us:** the most compact and quietest row. Status and priority line up at the very start, so you can scan
  down one edge.
- **Costs:** you have to learn what the marks mean, and projects show as dots with no names.
- **Reversible?** Yes, same as A.

### C. Two lines

The title on line one, with source, projects (dot and name) and tags as text on line two. A fixed column on the right
holds the status pill over the priority.

- **Gets us:** the most information per row, and nothing is cut to "+n" at 1440.
- **Costs:** taller rows (60 px against 44), so 11 rows fit on a 900 px-tall screen instead of 15. At 390 px, project
  names on line two are cut off mid-word, a flaw the spike did not fix.
- **Reversible?** Yes.

| Measured (Chromium, light, your 12 links) | today | A | B | C |
|---|---|---|---|---|
| Row height at 1440, px | 44 | 44 | 44 | 60 |
| Rows that fit on a 1440×900 screen | 15 | 15 | 15 | 11 |
| Different left edges of status across 12 rows | 8 | 1 | 1 | 1 |
| Row height at 390, px | 80 | 80 | 82 | 82 |

These were measured with `getBoundingClientRect` on every row (`design/options/T-0016/measures-rows.json`).

## Question 2: status and priority in the details

### A. Two dropdowns

Two dropdowns like Source and Media, each showing its value's mark (circle or bars).

- **Gets us:** the calmest and most compact panel, matching the fields above it.
- **Costs:** two clicks to change a value, and you can't see the other choices until you open it.

### B. Label and value, with a menu

Status and Priority as label and value lines, like "Saved" and "Last edited". Clicking the value opens a menu of
every choice with its mark.

- **Gets us:** reads like the rest of the details, and an unset field shows "No status" quietly.
- **Costs:** two clicks to change a value, and it looks less like something you can click.

### C. Segments with marks

Each field gets its own full-width line of three equal segments with marks and words: ○ To read · ◐ In progress ·
✓ Done; Low · Medium · High with bars. Pressing the chosen one again, or "Clear", unsets it.

- **Gets us:** one click to change a value, every choice visible, and room for full words. It replaces today's
  cramped four-way segments, where "None" took a slot.
- **Costs:** the tallest of the three, with two full-width lines in the panel.

All three are reversible: they change the panel only.

## Recommendation

**Updated after the second pass: the Fable redesign with row r1 and control c2, plus its shared redesign of the
details panel, frame and phone (`?row=r1&ctl=c2`).**

- **r1:** it is the first pass's columns (A), now with the marks and words, and the header line. Status starts on
  one edge, every column lines up, and it fits as many rows as today. r2 is just as aligned, but its projects and
  tags are right-aligned, so they start at different places on each row again.
- **c2:** it is the first pass's segments (C), refined. One click changes a value, every choice shows with its mark,
  and the × makes clearing plain.
- **The shared redesign:** it fixes the two traps found (the hover Archive over the time, and GitHub's icon in dark
  mode) and the phone cut-offs, and it adds the pinned footer and the wrapping title.

What would change it: if you don't want the departures from Ledger listed above (a bottom tab bar on the phone,
borderless fields, day names outside the card), say which ones to keep as they are. Each can be built either way.

The first pass's reasoning, kept for the record: **Rows A, controls C.**

- **Rows A:** it is the one that fixes what you named, alignment, without costing rows per screen or asking you to
  learn symbols. B is as aligned and quieter, but status and priority become marks you have to decode. C costs four
  rows per screen and has a flaw at phone width.
- **Controls C:** it keeps one-click changes and shows every choice. Its marks (circle, bars) could also appear in
  row A's Status and Priority cells, so the two screens share one language.

What would change it: if you want the list as quiet as possible and would learn the marks, choose rows B (and C fits
it best). If you'd rather the details panel stay compact, choose controls B.

## What happens next, either way

A light-lane task builds the chosen row in `LinkList.svelte` and the chosen control in `Detail.svelte`. It covers
390 and 1440 px, light and dark, Chromium and WebKit, and adapts select mode to the new row, which the spike did not
do. QA checks it, then you look. T-0009 then starts on that row.

Found along the way, for that task:

- **Archive button trap:** a click on a row's time cell can land on the hover Archive button that covers that column,
  and archive the link. This is in today's app too.
- **GitHub icon in dark mode:** its favicon is black on the dark background.

## Sources

- Spike report M-2026-10-24-667c7ac1 (builder@T-0016). The spike is kept, not committed, at the session scratchpad
  `T-0016/spike/`, with the `?row=` and `?ctl=` switches and `shoot.mjs`.
- The person's T-0008 test notes, 2026-10-24 14:01 UTC, in `work/notes/orchestrator.md`.
