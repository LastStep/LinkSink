---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0027
title: A project can be renamed from its own page, as well as from the Projects page
status: done
lane: light
done_when:
  - "On a project's page its name can be edited in place (click or a Rename action, Enter saves, Escape cancels); the sidebar, the lists and the address follow at once"
  - "An empty name or one another project has is refused with a message, as on the Projects page"
  - "An e2e test renames a project from its page"
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

# A project can be renamed from its own page, as well as from the Projects page

## Context

The person, 2026-10-25: "project names should be editable". A rename already exists on the Projects page
(src/routes/projects/+page.svelte, `rename`, through PATCH /api/projects/[id]); the person did not find it from where
they were, a project's own page (src/routes/projects/[id]/). The same rename, where they looked.

## Scope

The project page's header; an e2e test.

## Out of scope

Tags (they rename on the Tags page); the sidebar's own menu.

## Notes

- Started on the person's word, 2026-10-25 13:55 UTC: "okay do them. and only run one verifier for all combined". Built on
  t0022-sidebar-rename-icon with the other tasks on that branch; one verifier checks every branch of this round together.
