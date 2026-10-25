---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-25-T-0019
task: T-0019
role: builder
model: opus
started: 2026-10-25 07:19
finished: null
outcome: running
commits: []
labels: {}
---

# Run: Import preview — see what a file holds and map each folder before anything is saved

> Opened at the start of the session and added to as it goes. Not written at the end.

## What is different now

(filled at the end)

## Deviations from the plan

(filled as they happen)

## Log

- 07:19 Read brief M-2026-10-25-c646dda9, STATE, T-0019, P-T-0019, ADR-0005, T-0012's import code and tests.
  Worktree clean at 9129f76 on t0019-import-mapping.
- Findings before code:
  - T-0012 sends the file itself as the body (octet-stream/text/html/text/csv only; multipart refused on purpose so
    no cross-site form can post). The plan says "multipart"; that would undo T-0012's guard. See Deviations.
  - The body-limit hook (`src/hooks.server.ts`, outside this task's paths) lets only the exact path `/api/import`
    past 512 KB, so a separate `/api/import/preview` route would 413 on real files. See Deviations.
  - T-0012's API test asserts Chrome's "Other bookmarks" (no container attribute) becomes a project when the raw
    file is posted. The new defaults make it No project. See Deviations.

## Ladder

(pending)

## What did not work

(pending)

## Evidence for a human

(pending)

## Files changed

(pending)

## Processes left running

(pending)

## What it cost

(pending)

## Left for next time

(pending)

## Verifier

> Added by the verifier, in a fresh context. Pass or fail, with reasons.
