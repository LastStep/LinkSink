---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0025
title: A sort control beside the filters, sorting by status and priority as well as dates and title
status: running
lane: light
done_when:
  - "A sort control sits beside the filter button on every list screen (desktop and phone), showing the current sort, and changes the order at once"
  - "It sorts by: Date saved, Last edited, Last opened, Title, Priority and Status; Status in the order the status list shows, links with none last; each kept in the address like the filters"
  - "The filter panel's own Sort row and the 'Sorted by' chip still agree with it (or the row goes, if the control replaces it)"
  - "Unit tests for each new order; an e2e for the control"
  - "The ladder climbs green at the branch's HEAD"
depends_on: []
blocked_by: null
created: 2026-10-25
started: 2026-10-25
finished: null
labels:
  bonsai.branch: t0023-details-and-sort
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.model: sonnet
  workflow.feature: F-web-mvp
  workflow.milestone: "MVP"
---

# A sort control beside the filters, sorting by status and priority as well as dates and title

## Context

The person, 2026-10-25: "alongside filters i want a sorting option which can sort things based on different
parameters like status, priority etc." Today the sort lives at the foot of the filter panel (src/lib/ui/FilterPanel.svelte)
with four values (src/lib/search/filters.ts `SORTS`: saved, edited, priority, title). The list groups by day or
priority (src/lib/ui/LinkList.svelte); a status sort groups by status the same way. The orchestrator chose the list of
sorts above from the person's "status, priority etc."; the person may change it when they look.

## Scope

src/lib/search/filters.ts, the list's sort and grouping, the control beside the filters, tests. The 60 KB budget on
`/` is tight (58.22 KB): measure it.

## Out of scope

The board view (T-0026).

## Notes

- Started on the person's word, 2026-10-25 13:55 UTC: "okay do them. and only run one verifier for all combined". Built on
  t0023-details-and-sort with the other tasks on that branch; one verifier checks every branch of this round together.
