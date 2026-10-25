---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0022
title: The sidebar's project list scrolls on its own; Settings and everything below it stay in place
status: todo
lane: light
done_when:
  - "With 300 projects the desktop sidebar fits the window: the project list scrolls inside its own area, and Settings and every control below it stay visible and fixed at the bottom (e2e at 1440x900 and 1280x720)"
  - "With a few projects nothing moves from today's layout (screenshot before and after)"
  - "The keyboard still reaches every project in order, and the list scrolls to the focused one"
  - "The ladder climbs green at the branch's HEAD"
depends_on: []
blocked_by: null
created: 2026-10-25
started: null
finished: null
labels:
  workflow.owner: builder
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
