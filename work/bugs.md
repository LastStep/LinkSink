---
title: Known bugs   # the bugs register; every field and how to fill it: skill workflow:bugs
updated: 2026-10-25
---

# Known bugs

The defects someone has seen or proven and nobody has fixed yet. How to add or fix one: skill workflow:bugs.

## Open

| Id | What goes wrong | Where | Found by |
|---|---|---|---|
| **BUG-003** | With many projects (an import of 342 Firefox bookmarks), the sidebar's project list runs past the screen and pushes Settings and the controls below it out of view; the list does not scroll on its own | the desktop sidebar, src/lib/ui/Shell.svelte | the person, 2026-10-25, in Docker (T-0022) |
| **BUG-004** | After an import, the open page never shows the details fetched for the imported links (titles, icons, previews) until a full reload, and nothing says that fetching is under way. The fetch itself works: 342 links in about 7 min, 189 with details, 153 failed on dead or refusing sites (48 answered 404, 44 answered 403, 26 domains gone, 15 timed out) | the client store: `store.refresh()` runs only on a full page load (Shell.svelte onMount); src/lib/store/api.ts polls details only for a pasted link, for 10 s | the person, 2026-10-25; cause by the orchestrator from the app's log and database (T-0023) |
| **BUG-005** | The browser tab shows Svelte's default logo, not LinkSink's mark | src/lib/assets/favicon.svg (the template's), src/routes/+layout.svelte | the person, 2026-10-25 (T-0028) |

## Fixed

| Id | What went wrong | Fixed in | Task |
|---|---|---|---|
| **BUG-001** | In a link's details, "Add to project" opened the tag picker, and a project could not be made from there | 90334de: the picker opens on tags only or projects only ("Add to project" makes a project from a new name) | T-0015 |
| **BUG-002** | A list did not follow the store: a link stayed on a tag's page (and on a project's page and Unsorted) after a change took it out | 90334de: every list keeps only the links that fit its view; the open link stays reachable until its panel closes | T-0015 |

## Known, not bugs

- Search applies only on Enter: search as you type is T-0009 (written, waiting for the person's approval). The person
  wants it automatic and fast (2026-10-24).
