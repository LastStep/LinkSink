---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0023
title: Details fetched after an import show up on the open page, with a line saying how many are still being fetched
status: running
lane: light
done_when:
  - "After an import, while the server fetches page details, the open list fills in each link's title, icon and preview as it arrives, with no reload (e2e on the fixture site)"
  - "While links still wait for their details, the screen says so with a count that goes down (e.g. 'Fetching details: 120 left'), and the line goes away when none are left"
  - "Polling stops once no link is waiting and never runs while none is waiting; a hidden tab polls no faster than once every 10 s"
  - "It uses the existing API; if it cannot without changing an endpoint, the builder stops and reports first (that is the full lane)"
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

# Details fetched after an import show up on the open page, with a line saying how many are still being fetched

## Context

BUG-004 (work/bugs.md). The person, 2026-10-25: "after the import, no data has been auto fetched for the links".
The fetch works (the app's log and database in the person's Docker run: 342 links in about 7 minutes, 189 with
details, 153 failed on dead or refusing sites); the open page never shows it, because `store.refresh()` runs only on
a full page load (src/lib/ui/Shell.svelte onMount) and src/lib/store/api.ts watches only a pasted link, for 10 s.
T-0010 (sync) replaces this polling later with pulls since a cursor; keep the change small and easy to remove.

## Scope

The client store (src/lib/store/), the list's status line, an e2e test.

## Out of scope

The fetcher, its pace, and a way to fetch details again for failed links (proposed separately if the person wants it).

## Notes

- Started on the person's word, 2026-10-25 13:55 UTC: "okay do them. and only run one verifier for all combined". Built on
  t0023-details-and-sort with the other tasks on that branch; one verifier checks every branch of this round together.
