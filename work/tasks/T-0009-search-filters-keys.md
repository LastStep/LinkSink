---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0009
title: Search, filters and keyboard — FTS5 search as you type, combined filters in the URL, sort, keys and the command palette
status: running
lane: full
done_when:
  - "links_fts searches title, description, url, notes, tags_text and projects_text (unicode61 remove_diacritics 2, prefix '2 3'), soft-deleted rows excluded, kept current by triggers; GET /api/links?q= serves it"
  - "One query parser in src/lib/search/ (words AND, prefix on the last word, quoted phrases) is shared by server and client, with a unit table"
  - "Results update as I type, within 150 ms of the last keystroke (100 ms debounce + query), without a page load (e2e measures it)"
  - "Filters by source, media, tags (any/all switch), projects, status and priority combine as the one-pager says (any within one filter, all across filters); archived links are excluded unless archived=include|only; the whole view is in the URL and a reload reproduces it (unit SQL builder + e2e)"
  - "Paging is keyset on created_at,id, 50 per page; sort by saved (default), edited, priority or title"
  - "/, n, j/k and arrows, Enter, e, t, p, a, x and Ctrl/Cmd+K work as the plan says; the command palette adds a link, searches, jumps to a project, tag or source, and goes to Unsorted, Archive or Settings (e2e)"
  - "Every screen follows ADR-0005 (the redesign on direction A) at 390 and 1440 px, light and dark, in Chromium and WebKit; the search field reads \"Filter as you type\", its / hint focuses it, and status and priority filters use the StateMark marks"
  - "The ladder climbs green at the branch's HEAD, first-load JS within 60 KB gzipped (the palette and filter panel load on first use)"
depends_on: [T-0008, T-0018]
blocked_by: null
created: 2026-10-24
started: 2026-10-25
finished: null
labels:
  bonsai.branch: t0009-search-filters-keys
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 6
---

# Search, filters and keyboard

## Context

Plan `work/plans/P-T-0002.md`, Approach step 7 (T-0009). One-pager `work/features/F-web-mvp.md`: the search, filter
and keys done-when lines and the filtering rule. T-0003 built `links_fts`; T-0007 restored its triggers; T-0008 keeps
`tags_text` and `projects_text` current and gave `GET /api/links` `view`, `project` and `tag` parameters. The first
load is 51.84 KB of 60: new UI loads on first use.

## Scope

The FTS5 columns and triggers, the shared query parser, the filter SQL builder and its URL form, sort and keyset
paging, the search box and filter panel, the key map and the command palette.

## Out of scope

The local in-memory search over the device copy (T-0010 runs the same parser over it). Saved views beyond the URL.

## Notes
