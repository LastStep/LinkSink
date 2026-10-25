---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0028
title: LinkSink's mark is the app's icon everywhere — the browser tab, bookmarks and a phone's home screen
status: done
lane: light
done_when:
  - "The browser tab shows LinkSink's mark (the one top left, src/lib/ui/Mark.svelte), legible in light and dark browser themes; Svelte's logo is gone from the app"
  - "An apple-touch-icon (180 px PNG) and a 32 px PNG fallback exist and are linked from every page; a phone's 'Add to Home Screen' shows the mark"
  - "Every page links them, the sign-in and sign-up pages included (e2e reads the link tags)"
  - "The ladder climbs green at the branch's HEAD"
depends_on: []
blocked_by: null
created: 2026-10-25
started: 2026-10-25
finished: 2026-10-25
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

# LinkSink's mark is the app's icon everywhere — the browser tab, bookmarks and a phone's home screen

## Context

BUG-005 (work/bugs.md). The person, 2026-10-25: "the link sink icon on top left that i see, i want that everywhere
the icon is shown for the app. like browser tab icon and so on". src/lib/assets/favicon.svg is still the SvelteKit
template's; src/routes/+layout.svelte links it. The PWA manifest's icons come with T-0011 and use the same files.

## Scope

The icon files, the head links in the layout, a test.

## Out of scope

The PWA manifest and service worker (T-0011).

## Notes

- Started on the person's word, 2026-10-25 13:55 UTC: "okay do them. and only run one verifier for all combined". Built on
  t0022-sidebar-rename-icon with the other tasks on that branch; one verifier checks every branch of this round together.
