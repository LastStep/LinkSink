---
id: ADR-0005   # a decision record; every field and how to fill it: skill workflow:decision
title: Ledger rows become two lines with a fixed state cell, status and priority are radio lists, and the shared redesign is taken whole
status: accepted
date: 2026-10-25
scope: product
decided_by: person
superseded_by: null
---

# ADR-0005: Two-line rows with a fixed state cell, radio-list controls, and the shared redesign

## Context

After testing T-0008, the person found the list row misaligned (title, tags, project dot, status and priority all
start wherever the previous item ended) and asked for better status and priority controls in the details. Two
throwaway spikes on a copy of their links drew the options (OPT-0003; the first pass, then a redesign on Fable,
report M-2026-10-24-d34fa073). Shots are in `design/options/T-0016/`, and the comparison page is
https://claude.ai/artifact/5EHQa6dDUeoLn1jbyTLwf3. This record amends ADR-0003 (Ledger) and does not replace it.

## Options

- **Row:**
  - f1, columns under a header (recommended). Aligned, and as many rows as today.
  - f2, state first. Aligned status, but ragged tags and projects.
  - **f3, two lines** (chosen). Every tag and project name readable, with status and priority in a fixed cell on
    the right; 56 px rows, so 11 fit on a 1440×900 screen against 14 today.
- **Control:**
  - c1, property rows with a menu.
  - c2, segments with marks (recommended).
  - **c3, radio lists** (chosen). Every choice visible, "none" included; the tallest panel.
- **Shared redesign:** taken whole, every departure from Ledger included.

## Decision

The person's words, 2026-10-25 06:41 UTC: "OPT-0003 picks: row f3, control c3, the whole shared redesign." LinkSink
builds the following.

- **Rows (r3).** The title on line one. Line two holds the source, each project as a dot and name, and the tags as
  text. A fixed cell on the right holds the status (mark and word) over the priority (bars and word).
- **One set of marks everywhere** (row, details, organiser):
  - Status: ○ To read, ◐ In progress, a green ✓ for Done, and a dashed circle for none.
  - Priority: 1 to 3 bars, with High in the negative red.
- **Details (c3).** Status and Priority side by side, each a radio list of four rows (none plus the three).
- **The shared redesign, in the details:** the title wraps. Source and Media sit in property rows. Fields have no
  border until focused. The footer is pinned to the panel's foot.
- **The shared redesign, in the frame:**
  - Day names sit on the ground above their card.
  - Hover actions get their own slot after the time.
  - A selected row gets a 2 px accent bar.
  - Empty states are written in plain words.
  - Favicons sit on a pale tile in dark mode.
  - Only Unsorted keeps a count in the sidebar.
- **The shared redesign, on the phone:** a bottom tab bar (Links · Unsorted · Projects · Tags · More), the details
  as a sheet with a grab handle, and a second line where whole items drop when they don't fit.

## Consequences

- **Colour.** Status and priority leave the pills: the marks carry them. Colour stays limited to Done's check and
  High's bars. The accent blue gains one more use, the selected row's bar, and stays off everything else.
- **Fewer rows per screen.** Rows are taller, so 11 fit on a 1440×900 screen instead of 14. Making rows denser
  again, or going back to "+n" tags, is a change to this record, not a tweak.
- **Phone navigation.** It is the bottom tab bar. The old top-bar menu survives only behind "More".
- **The spikes are reference, not code to port.** The build is rebuilt from `design/tokens.css`, these shots and
  `design/options/T-0016/fable/REPORT.md` (the spike's code is gone with its scratchpad).
- **T-0009** (search, filters, keys) builds on this row and these marks. Its filter chips for status and priority use
  the same marks.
