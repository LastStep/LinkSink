---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0019
title: Import preview — see what a file holds and map each folder before anything is saved
status: todo
lane: full
done_when:
  - "Choosing a file in Settings → Import writes nothing: it shows a preview with the links found, those already saved (duplicates), those that could not be read, and every folder (its full path and link count) (API test: preview leaves the database unchanged)"
  - "Each folder has one choice: New project (name editable, default the folder's name, nested names joined with \" / \"), Existing project (a picker; preselected when a project of that name exists), Tag (name editable), or No project; the browser's own top folders (bookmarks bar, Other Bookmarks, Bookmarks Menu, Mobile) default to No project, the rest to New project (unit for the defaults)"
  - "Toggles: keep the file's tags (on by default); Pocket's read state becomes Done (on by default, shown only for Pocket files)"
  - "Import N links writes exactly what the mapping says (projects made once, existing ones reused, folder-as-tag applied, no-project links land in Unsorted), through syncWrite in batches, and shows the summary as T-0012 does; Cancel discards everything (e2e for each choice)"
  - "The mapping is checked on the server: an unknown or another user's project id, or a path not in the file, is refused and nothing is written (API test)"
  - "The preview screen follows ADR-0005's look at 390 and 1440, light and dark, in Chromium and WebKit; a file with 200 folders stays usable (folders scroll in their own list)"
  - "The ladder climbs green at the branch's HEAD; first-load JS on / within 60 KB gzipped (the screen loads on Settings only)"
depends_on: [T-0012]
blocked_by: null
created: 2026-10-25
started: null
finished: null
labels:
  bonsai.branch: t0019-import-mapping
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 3
---

# Import preview and folder mapping

## Context

On 2026-10-25 at 07:15 UTC the person was asked whether a browser's top folders should become projects on import.
They answered: "i want a screen which allows for mapping and choosing". This builds on T-0012's parsers and writer
(`src/lib/server/import/`) and its Settings section (`src/routes/settings/ImportExport.svelte`). Plan:
`work/plans/P-T-0019.md`.

## Scope

- `src/lib/server/import/`: a dry-run preview, and a mapping applied by the writer.
- `src/routes/api/import/`: a preview route and an import that takes a mapping.
- The import UI in `src/routes/settings/`.
- Tests.

## Out of scope

The list screens (T-0018), and new import formats (TOREAD flags, Raindrop CSV and Pocket's old HTML export, each
proposed separately).

## Notes
