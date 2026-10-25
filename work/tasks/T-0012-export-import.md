---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0012
title: Export (bookmark HTML and full JSON) and import (bookmark HTML and Pocket CSV)
status: verify
lane: full
done_when:
  - "GET /api/export.html returns a Netscape bookmark file of the signed-in user's live links: one folder per project (a link in several projects appears in each), links in no project at the top level, TAGS, ADD_DATE, LAST_MODIFIED, notes as <DD>; Firefox and Chromium import it (e2e imports it into a fresh account round trip)"
  - "GET /api/export.json returns {\"format\":\"linksink.export/1\"} with every link and all its fields, sources, tags and projects, archived links included, deleted ones not; another user's data never appears (API test with two users)"
  - "Import accepts a Netscape HTML file (browsers, Raindrop, Pinboard, linkding fixtures) and a Pocket CSV: folders become projects (nested names joined with \" / \"), TAGS become tags, ADD_DATE becomes created_at, <DD> becomes notes, Pocket's read state becomes status done, saved_via = 'import' (unit table per fixture)"
  - "Duplicates (by url_key, against saved links and within the file) are skipped; writes go through syncWrite in batches of 500; a 5,000-link file imports in under 10 s on this machine (test with timing)"
  - "The import answers with a summary (added, skipped as duplicates, failed to parse, with the first failing lines) and the page shows it; metadata, source and media are then fetched in the background through the fetch queue (fed from the database by the feeder after T-0012 round 2), never more than 2 at once (unit)"
  - "Malformed, oversized (over 20 MB) or non-bookmark files are refused with a clear message and nothing written; HTML in titles and notes is stored as text and never rendered as markup (unit + e2e)"
  - "Settings has an Export section (two download buttons) and an Import section (file picker, format detected, summary), at 390 and 1440, light and dark"
  - "The ladder climbs green at the branch's HEAD, first-load JS on / within 60 KB gzipped (Settings' import code loads on that page only)"
depends_on: [T-0008]
blocked_by: null
created: 2026-10-25
started: 2026-10-25
finished: null
labels:
  bonsai.branch: t0012-export-import
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 4
---

# Export and import

## Context

This is plan `work/plans/P-T-0002.md`, Approach step 10 (T-0012); its import half is the person's word of 2026-10-24.
The one-pager `work/features/F-web-mvp.md` has the export and import done-when lines. T-0012 runs beside T-0018
(the redesign of the list screens). It touches only the server, a new import module and the Settings page.

## Scope

- `src/lib/server/export.ts` and `src/lib/server/import/` (parsers for Netscape HTML and Pocket CSV, plus the batch
  writer).
- `src/routes/api/export.*` and `src/routes/api/import`.
- `src/routes/settings/+page.svelte`, for the Export and Import sections.
- Fixtures under `src/lib/server/import/fixtures/`, plus tests.

## Out of scope

The list screens, `LinkList`, `Detail` and `Shell` (T-0018 is changing them), and search (T-0009). Sync is T-0010:
import writes through `syncWrite`, so it is already ready for sync.

## Notes
