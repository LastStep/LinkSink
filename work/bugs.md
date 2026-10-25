---
title: Known bugs   # the bugs register; every field and how to fill it: skill workflow:bugs
updated: 2026-10-25
---

# Known bugs

The defects someone has seen or proven and nobody has fixed yet. How to add or fix one: skill workflow:bugs.

## Open

| Id | What goes wrong | Where | Found by |
|---|---|---|---|

## Fixed

| Id | What went wrong | Fixed in | Task |
|---|---|---|---|
| **BUG-003** | With many projects the sidebar's project list ran past the screen and pushed Settings out of view | e2c5e7b: the list scrolls in its own area; Settings and Log out stay fixed (e51a96e) | T-0022 |
| **BUG-004** | After an import the open page never showed the details fetched later, and nothing said fetching was under way | 8ecee76: rows fill in as details arrive, with a "Fetching details: N left" line (e51a96e) | T-0023 |
| **BUG-005** | The browser tab showed Svelte's default logo | 437f890: LinkSink's mark as the SVG, 32 px and apple-touch icons on every page (e51a96e) | T-0028 |
| **BUG-001** | In a link's details, "Add to project" opened the tag picker, and a project could not be made from there | 90334de: the picker opens on tags only or projects only ("Add to project" makes a project from a new name) | T-0015 |
| **BUG-002** | A list did not follow the store: a link stayed on a tag's page (and on a project's page and Unsorted) after a change took it out | 90334de: every list keeps only the links that fit its view; the open link stays reachable until its panel closes | T-0015 |

## Known, not bugs

- Search applies only on Enter: search as you type is T-0009 (written, waiting for the person's approval). The person
  wants it automatic and fast (2026-10-24).
