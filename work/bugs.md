---
title: Known bugs   # the bugs register; every field and how to fill it: skill workflow:bugs
updated: 2026-10-24
---

# Known bugs

The defects someone has seen or proven and nobody has fixed yet. How to add or fix one: skill workflow:bugs.

## Open

| Id | What goes wrong | Where | Found by |
|---|---|---|---|

## Fixed

| Id | What went wrong | Fixed in | Task |
|---|---|---|---|
| **BUG-001** | In a link's details, "Add to project" opened the tag picker, and a project could not be made from there | 90334de: the picker opens on tags only or projects only ("Add to project" makes a project from a new name) | T-0015 |
| **BUG-002** | A list did not follow the store: a link stayed on a tag's page (and on a project's page and Unsorted) after a change took it out | 90334de: every list keeps only the links that fit its view; the open link stays reachable until its panel closes | T-0015 |

## Known, not bugs

- Search applies only on Enter: search as you type is T-0009 (written, waiting for the person's approval). The person
  wants it automatic and fast (2026-10-24).
