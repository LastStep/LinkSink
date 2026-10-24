---
format: bonsai.run/1
id: R-2026-10-24-T-0015-picker-and-live-lists
task: T-0015
role: builder
model: sonnet
started: 2026-10-24 22:42
finished: 2026-10-24 23:00
outcome: verify
commits: []
labels: {}
---

# Run: Add to project opens the projects picker; every list follows the store

## What is different now

In a link's details, "Add to project" opens a projects-only picker (search box reads "Find or create a project"); a new
name there makes a project and adds the link to it. "Add tag" opens a tags-only picker and still makes tags. The
"Organise" button keeps the full picker. Every list (Links, a tag, a project, Unsorted, Archive) keeps only the links
that fit it, so a link leaves the list the moment a change takes it out, with no reload.

## Deviations

- The focused pickers (tag-only, project-only) hide the status/priority/source/media block; the full "Organise" picker
  is unchanged. Judgement call, easy to reverse (`{#if !kind}` in Picker.svelte).
- Added `hold(ids)` to the `LinkStore` interface: the open link stays in the store while its details or picker are
  open, so the picker does not lose its link when the link leaves the view.

## Cause

The store's `belongs` only tested archived vs not. A link taken off a tag, off a project, or given a tag in Unsorted
never left its list. Fixed with `belongsToView` (types.ts) used by the store and by LinkList.

## Evidence

- Ladder at HEAD f7043f4 (clean tree), rungs 0-5 green (ran): unit 364 seen, 0 skipped (was 29 in the ratchet's base);
  e2e 34 seen, 0 skipped (7 new); first-load JS `/` 52.04 kB gzipped, `/login` 45.92, `/signup` 45.98 (limit 60).
- done_when 1: "Add to project opens the projects picker: it picks a project and creates a new one".
- done_when 2: "Add tag still opens the tags picker and creates a new tag".
- done_when 3: "a tag's page drops a link the moment its tag is removed in the details, with no reload".
- done_when 4: one test per view: project's page, Unsorted (project and tag, picker stays usable), Archive (restore),
  main list (archive and delete, each with an undo that adds the row back).
- Tests 1, 3, 4 and 5 fail on the old code (ran, with src stashed); the Archive and main-list tests passed on the old
  code too (those views already worked) and stand as regression guards.
- done_when 5: BUG-001, BUG-002 moved to Fixed in work/bugs.md (fix commit 90334de).

## What did not work

First ladder climb red at lint (an unused constant in the new e2e file); fixed and rerun green. No test weakened.

## Left

Proposed tasks: pasting a link while on a tag or project page now saves it but the row leaves at once (it has no
tag/project); consider adding it to that tag/project, or a note. Same view-follows-store rule now applies to a
link whose details are closed while it is out of view: it is dropped when the panel closes.

## Processes left running

none of mine (e2e servers on 4700 exit with their climbs; checked with ps). Another agent's `vite dev --port 4800`
(T-0016 spike) is running; not touched.
