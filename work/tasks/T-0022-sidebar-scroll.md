---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0022
title: The sidebar's project list scrolls on its own; Settings and everything below it stay in place
status: running
lane: light
done_when:
  - "With 300 projects the desktop sidebar fits the window: the project list scrolls inside its own area, and Settings and every control below it stay visible and fixed at the bottom (e2e at 1440x900 and 1280x720)"
  - "With a few projects nothing moves from today's layout (screenshot before and after)"
  - "The keyboard still reaches every project in order, and the list scrolls to the focused one"
  - "The ladder climbs green at the branch's HEAD"
depends_on: []
blocked_by: null
created: 2026-10-25
started: 2026-10-25
finished: null
labels:
  bonsai.branch: t0022-sidebar-rename-icon
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.model: sonnet
  workflow.feature: F-web-mvp
  workflow.milestone: "MVP"
---

# The sidebar's project list scrolls on its own; Settings and everything below it stay in place

## Context

BUG-003 (work/bugs.md). The person, 2026-10-25, after importing their Firefox bookmarks in Docker: "the projects list
on the left sidebar needs to be scrollable, but the button part of the sidepart which starts from settings, need to
be static".

## Scope

The desktop sidebar in src/lib/ui/Shell.svelte and its styles; an e2e test.

## Out of scope

The phone tab bar, and the projects page itself.

## Notes

- Started on the person's word, 2026-10-25 13:55 UTC: "okay do them. and only run one verifier for all combined". Built on
  t0022-sidebar-rename-icon with the other tasks on that branch; one verifier checks every branch of this round together.
