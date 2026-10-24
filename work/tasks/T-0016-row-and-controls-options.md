---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0016
title: Options for the Ledger row layout and the details' status/priority controls, shown on real data
status: running
lane: director
done_when:
  - "work/options/ holds one write-up with 2–4 row layouts (tags, projects, status, priority) and 2–4 status/priority controls for the details, each pictured from a real spike run at 390 and 1440 px, light and dark, with one recommended"
  - "The spike lives outside the repository and nothing of it is committed"
  - "The person chooses; the choice is recorded as a decision and the build becomes its own task"
depends_on: [T-0008]
blocked_by: null
created: 2026-10-24
started: 2026-10-24
finished: null
labels:
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: orchestrator
  workflow.feature: F-web-mvp
  workflow.estimate_h: 1.5
---

# Options for the row layout and the status/priority controls

## Context

These are the person's T-0008 test notes 2 and 3 (`work/notes/orchestrator.md`). The current row shows link, tags,
project dot, status and priority in a line, which they called "kind of misaligned". The details' segmented controls
for status and priority need "better UI components". It's a question of taste, so it falls in the director lane:
pictures from a throwaway spike (workflow:prototype), then the person picks. The look is direction A, Ledger
(ADR-0003, `design/reference/`).

## Scope

A spike in the scratchpad, the options write-up, and the decision record once the person chooses.

## Out of scope

Any change to `src/`. The build is a separate task, written after the choice.

## Notes
