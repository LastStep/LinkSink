---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0008
title: Organising and the Ledger screens — tags, projects, status, priority, archive, bulk edit, Unsorted, source rename
status: approved
lane: full
done_when:
  - "tags, projects, link_tags and link_projects exist per the plan's Data model (partial unique indexes among live rows, version and deleted_at), and every write to them goes through syncWrite"
  - "From a link, a keyboard-driven picker sets its tags (type to find or create), projects, status, priority, source and media; every hand edit of title, description, source or media joins user_set (e2e)"
  - "Bulk select (x, shift-click, long-press on phone) sets tags, projects, status, priority, archive or delete on many links in one syncWrite (unit + e2e)"
  - "Projects screen: create, rename, colour, description, reorder, delete with confirmation, which removes the project from its links and keeps the links; Tags screen: rename, merge two tags, colour, delete (e2e)"
  - "Unsorted shows live, unarchived links with no tags and no project; Archive shows archived links; archive and restore each have an undo (e2e)"
  - "Renaming a source in settings applies to later links from its hosts (e2e saves another link from that host)"
  - "Each link shows when it was saved and last edited; opening it records opened_at"
  - "The list, link, picker, Projects, Tags, Unsorted, Archive and settings screens follow direction A (design/tokens.css, design/reference/a.html as reference only) at 390 and 1440 px, light and dark; the person looks"
  - "The ladder climbs green at the branch's HEAD, first-load JS within 60 KB gzipped"
depends_on: [T-0006, T-0007]
blocked_by: null
created: 2026-10-24
started: null
finished: null
labels:
  bonsai.branch: t0008-organising
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 8
---

# Organising and the Ledger screens

## Context

Plan `work/plans/P-T-0002.md`, Approach step 6 (T-0008) and its Data model (`tags`, `projects`, `link_tags`,
`link_projects`, `user_set`). One-pager `work/features/F-web-mvp.md`: the fields list, "Organising quickly", and the
tags/projects, archive, dates and design done-when lines. Look: ADR-0003, direction A (Ledger); rebuild the screens in
Svelte from `design/tokens.css`, never port the mockup's code. Every synced write through `syncWrite` (ADR-0001).

## Scope

The four organising tables and their migration, their API through `syncWrite` behind the store interface, the picker,
bulk select, Projects and Tags screens, Unsorted and Archive views, source rename in settings, and the Ledger look for
every screen that exists by then (the list, sign-up and login included). Serving the Geist font (named in the tokens,
not served yet) if it fits the budget.

## Out of scope

Search, filters, sort and the keyboard map beyond the picker (T-0009). Sync endpoints and offline (T-0010). Devices
and Phone settings (T-0010, T-0011). Export and import (T-0012).

## Notes

Starts after T-0006 and T-0007 land.
