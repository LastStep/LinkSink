---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0024
title: Import mapping — each folder can go to several projects and several tags, chosen in two dropdowns side by side
status: todo
lane: full
done_when: []
depends_on: [T-0019]
blocked_by: null
created: 2026-10-25
started: null
finished: null
labels:
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.milestone: "MVP"
---

# Import mapping — each folder can go to several projects and several tags, chosen in two dropdowns side by side

## Context

The person, 2026-10-25: "for the import, for every folder i want to be able to choose multiple projects and tags,
with their dropdowns shown saperately side by side". Today each folder maps to one project, one tag, or no project
(T-0019, plan work/plans/P-T-0019.md; T-0019 reads `verify`). The mapping sent with an import changes shape, so this
is the full lane: a short amendment of P-T-0019 for the person to approve, then `done_when`.

## Scope

The import preview in src/routes/settings/, the mapping in src/lib/server/import/ and src/routes/api/import/, tests.

## Out of scope

New import formats; the list screens.

## Notes
