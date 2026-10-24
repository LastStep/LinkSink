---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0006
title: Links and paste-to-save — links JSON API through syncWrite, URL normalise and duplicates, store interface, global paste with optimistic row, delete with undo
status: running
lane: full
done_when:
  - "POST/GET/PATCH/DELETE /api/links work with the session cookie or a Bearer token, every write goes through syncWrite, and DELETE soft-deletes (unit + API tests)"
  - "normalise(url) gives url_key per the one-pager's rule (tracker denylist, www, trailing slash, sorted query, fragment, default port; YouTube v/t/list kept), proved by a table of at least 30 cases"
  - "A duplicate POST returns 200 with the existing link and duplicate: true and creates no row; e2e pastes the same address twice with utm and www variants and sees one row"
  - "The client reads and writes links only through src/lib/store/ (list, get, put, remove, subscribe), whose first implementation calls the API"
  - "Pasting a link anywhere in the app on desktop (outside other text inputs) saves it, and the row shows in under 100 ms, before the server answers (e2e dispatches a paste and times it)"
  - "Delete shows a 5-second undo that restores the link (e2e)"
  - "A unit test fails if any API call changes a synced table without its version rising"
  - "The ladder climbs green at the branch's HEAD"
depends_on: [T-0003]
blocked_by: null
created: 2026-10-24
started: 2026-10-24
finished: null
labels:
  bonsai.branch: t0006-links-paste
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 5
---

# Links and paste-to-save

## Context

Plan `work/plans/P-T-0002.md`, Approach step 4 (T-0006), its Data model (`links`), and "Risk in the code" (a write that
skips `syncWrite`). One-pager `work/features/F-web-mvp.md`: the paste and duplicate done-when lines and the duplicate
rule. T-0003 built the `links` table with every column, `syncWrite` and a form action on the list page; this replaces
that form action with the API and the store. `url_key` is a placeholder until this task's `normalise()`.

## Scope

`src/routes/api/links/`, `src/lib/url.ts`, `src/lib/store/`, the paste listener, the list view's optimistic rows and
delete with undo, styled from `design/tokens.css` (plain, behind the tokens' names; the full Ledger screens come in
T-0008).

## Out of scope

Metadata fetching, source and media classification (T-0007; a new link's title is its hostname and `meta_state` is
`pending` until then). Tags, projects, status, priority (T-0008). Search beyond what T-0003 has (T-0009). Sync
endpoints and the local store (T-0010). Runs beside T-0007 on disjoint folders; T-0006 lands first if both add
migrations.

## Notes
