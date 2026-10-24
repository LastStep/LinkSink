---
title: Known bugs   # the bugs register; every field and how to fill it: skill workflow:bugs
updated: 2026-10-24
---

# Known bugs

The defects someone has seen or proven and nobody has fixed yet. How to add or fix one: skill workflow:bugs.

## Open

| Id | What goes wrong | Where | Found by |
|---|---|---|---|
| **BUG-001** | In a link's details, "Add to project" opens the tag picker instead of the projects one, and a project cannot be created from there | `src/lib/ui/Detail.svelte` (the "Add to project" button, line 203) and `src/lib/ui/Picker.svelte`, at b0354f2 | The person's test notes, 2026-10-24 14:01 UTC |
| **BUG-002** | On a tag's page (`/tags/<id>`), removing that tag from a link in its details leaves the link in the tag's list until a reload: the list does not follow the store | `src/routes/tags/[id]/+page.server.ts` and `+page.svelte` (list loaded once on the server, not from the store), at b0354f2 | The person's test notes, 2026-10-24 14:01 UTC |

## Fixed

| Id | What went wrong | Fixed in | Task |
|---|---|---|---|

## Known, not bugs

- Search applies only on Enter: search as you type is T-0009 (written, waiting for the person's approval). The person
  wants it automatic and fast (2026-10-24).
