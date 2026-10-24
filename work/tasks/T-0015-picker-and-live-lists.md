---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0015
title: Fix BUG-001 (Add to project opens the tag picker) and BUG-002 (lists do not follow the store)
status: done
lane: light
done_when:
  - "In a link's details, \"Add to project\" opens the projects picker; picking a project adds the link to it, and typing a new name there creates the project and adds the link (e2e)"
  - "\"Add tag\" in the details still opens the tags picker and still creates a new tag (e2e)"
  - "On a tag's page, removing that tag from a link in its details takes the link off the list at once, with no reload (e2e)"
  - "The same holds on a project's page (removing the project), Unsorted (giving the link a project or tag), Archive (unarchiving) and the main list (archiving or deleting): each list drops or adds the link as the store changes, with no reload (e2e for each view)"
  - "BUG-001 and BUG-002 move to Fixed in work/bugs.md with the fixing commit"
  - "The ladder climbs green at the branch's HEAD, first-load JS within 60 KB gzipped"
depends_on: [T-0008]
blocked_by: null
created: 2026-10-24
started: 2026-10-24
finished: 2026-10-24
labels:
  bonsai.branch: t0015-picker-and-live-lists
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 1.5
---

# Fix BUG-001 and BUG-002

## Context

The person tested T-0008 on 2026-10-24 at 14:01 UTC and filed both bugs; see `work/bugs.md` for the details. In
`src/lib/ui/Detail.svelte`, the "Add to project" chip calls `onorganise`, the same handler the tag chip uses. Lists
should read from the store in `src/lib/store/`. A view that filters the store once, or keeps its own copy, goes stale.

## Scope

`Detail.svelte` and `Picker.svelte` (the picker opens on the projects kind), plus every list view under `src/routes/`
(`/`, `tags/[id]`, `projects/[id]`, `unsorted`, `archive`) and `LinkList.svelte`, so each derives its rows from the
store reactively. Add e2e tests for each view and update `work/bugs.md`.

## Out of scope

Status and priority controls, and the row layout. The person asked for new designs for both, and those are being
mocked up separately. Do not restyle either. Search as you type belongs to T-0009.

## Notes
