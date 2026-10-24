---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0004
title: Design direction — three taste-skill directions for LinkSink's screens, rendered as real mockups, the person picks one
status: done
lane: director
done_when:
  - "Three distinct design directions exist as static HTML mockups of the same LinkSink screens, at 390 px and 1440 px, light and dark, published for the person to open"
  - "Each direction's screens pass taste-skill's inspect.mjs --app check, with its output kept"
  - "The person has picked a direction (or asked for a revision), recorded as a decision"
depends_on: []
blocked_by: null
created: 2026-10-24
started: 2026-10-24
finished: 2026-10-24
labels:
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.model: fable
  workflow.feature: F-web-mvp
---

# Design direction — three taste-skill directions for LinkSink's screens, rendered as real mockups, the person picks one

## Context

The look is the person's call (director lane: UX and art direction). They found the motion spike's plain styling
boring and asked (2026-10-24) for "actually good" UI/UX mockups made with Fable and taste-skill. What the screens hold
is in `work/features/F-web-mvp.md`; the stack is ADR-0002 (Svelte, so the mockups' motion must be doable with CSS and
Svelte's built-in transitions).

## Scope

Static HTML/CSS mockups (with light JS only for showing interactions and motion) of LinkSink's key screens in three
directions, built in a scratch folder outside the repository and published as a private artifact. After the pick, a
follow-up step turns the chosen direction into `design/tokens.css` and reference screens in the repository.

## Out of scope

Any app code; the repository's `design/` folder (written only after the pick); the graph view.

## Notes

- 2026-10-24: the person chose A, Ledger (ADR-0003). Left: design/tokens.css and the reference screens in the
  repository, done in T-0003's first commit set (the repository has no commits yet).
