---
id: ADR-0003   # a decision record; every field and how to fill it: skill workflow:decision
title: LinkSink's look is direction A, Ledger
status: accepted
date: 2026-10-24
scope: product
decided_by: person
superseded_by: null
---

# ADR-0003: LinkSink's look is direction A, Ledger

## Context

The person found the motion spike's plain styling boring and asked for real mockups made with Fable and taste-skill
(T-0004). A builder dealt three directions with taste-skill's app-screen run and built each as a working mockup on
the project's real links (report M-2026-10-24-2f8b5d98; published at https://claude.ai/artifact/TMwfMgvW24UQoZcMvevNvZ).

## Options

- **A. Ledger** (chosen): links as lines in a day-by-day ledger, grouped under the day saved with the time; no colour
  in the chrome (white cards on a #f2f4f7 blue-grey ground, ink text, Geist); one blue (#1d5fbf, dark #7aa7ff) only on
  the link arriving now and focus; 256 px sidebar, the open link in a 400 px third column on desktop, a bottom sheet on
  phone; 44 px rows.
- **B. Shelf:** page pictures lead 72 px rows; raspberry accent ladder; DM Sans; centred dialog.
- **C. Night stream:** true black, no sidebar, media-shaped 80 px rows; lime on data; Inter; drawer.

## Decision

The web app follows direction A, Ledger: its tokens (a.css), shared structure and motion (base.css: easings
`--ease-out` cubic-bezier(.22,1,.36,1), `--ease-expo`, `--ease-exit`; 140/180/240 ms; list insert rise, FLIP reflow
280 ms, sheet rise 360 ms, panel-in, undo toast) and its screens, at phone and desktop widths, light and dark.

## Consequences

- No colour enters the chrome: projects keep their own dot colours, status and priority use the muted pill and flag
  styles; the accent blue stays reserved for "arriving now" and focus. Adding a brand colour, gradients or tinted
  panels is a change to this record, not a tweak.
- Motion is transform and opacity only, inside `prefers-reduced-motion: no-preference`, with fades for reduced motion.
- The mockup is reference, not code to port (workflow:prototype): the builders rebuild it in Svelte from
  `design/tokens.css` and the reference screens.
