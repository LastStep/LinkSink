---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0018
title: Build ADR-0005 — two-line rows with a fixed state cell, radio-list status and priority, and the shared redesign of details, frame and phone
status: plan
lane: full
done_when:
  - "Every list (/, a tag, a project, Unsorted, Archive) shows rows as ADR-0005 says: title on line one; source, projects (dot and name) and tags as text on line two; a fixed cell on the right with the status (mark and word) over the priority (bars and word). Across all rows the status cell starts at one left edge at 1440 (e2e measures the rects)"
  - "At 390 px no name on a row's second line is cut mid-word: items that do not fit are left out whole (e2e checks every visible item's right edge is inside the row)"
  - "One StateMark component draws status and priority marks in the row, the details and the organiser; unset shows a dashed circle or a faint dash; Done's check uses --positive and High's bars --negative (unit + visual)"
  - "In the details, Status and Priority are side-by-side radio lists of four (none plus the three), operable by keyboard as radio groups; choosing saves at once as today (e2e)"
  - "The details panel: the title wraps and becomes a field on click; Source and Media are property rows; Description and Notes are borderless until focused; Organise, Archive and Delete sit in a footer pinned to the panel's foot, visible without scrolling at 1440×900 and 390×844 (e2e)"
  - "Hover actions sit in their own slot after the time: a click on a row's time opens the details and never archives (e2e that fails on today's row)"
  - "Day names sit above their card; a selected row shows a 2 px accent bar; Unsorted, an empty tag and a no-match search show the plain-words empty states; only Unsorted keeps a sidebar count"
  - "In dark mode favicons sit on a pale tile, so a black icon (GitHub) is visible"
  - "On the phone: a bottom tab bar (Links · Unsorted with its count · Projects · Tags · More) replaces the top-bar menu, which stays reachable behind More; the details open as a sheet with a grab handle (e2e)"
  - "Select mode, the organiser and the paste flash still work on the new row (existing e2e pass unweakened)"
  - "QA in Chromium and WebKit at 390 and 1440, light and dark, against the shots in design/options/T-0016/fable/; the ladder climbs green at the branch's HEAD; first-load JS on / within 60 KB gzipped"
depends_on: [T-0016, T-0017]
blocked_by: null
created: 2026-10-25
started: null
finished: null
labels:
  bonsai.branch: t0018-redesign
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 5
---

# Build ADR-0005: two-line rows, radio-list controls and the shared redesign

## Context

The person chose row f3, control c3 and the whole shared redesign on 2026-10-25 (OPT-0003, ADR-0005). The look is
described in `design/options/T-0016/fable/REPORT.md` and its shots, but the spike's code is gone. Plan:
`work/plans/P-T-0018.md`.

## Scope

`src/lib/ui/` (LinkList, Detail, Picker, Shell, BulkBar, a new StateMark), `src/routes/` list pages and layout,
`design/tokens.css` (the `--icon-tile` and `--meta` tokens), plus e2e and unit tests.

## Out of scope

Search behaviour, filters and keyboard shortcuts (T-0009). The search field gets its new look only, and keeps
applying on Enter. No data, API or sync changes.

## Notes
