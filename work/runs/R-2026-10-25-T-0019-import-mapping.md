---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-25-T-0019
task: T-0019
role: builder
model: opus
started: 2026-10-25 07:19
finished: 2026-10-25 08:31
outcome: needs-verifier
commits: ["48dfb78", "828ef1b", "cdd2d54", "1346872", "22196f8", "ed6cc0e", "48d9120", "c97c6ed", "167e91d", "7a83064", "1d5919f"]
labels: {}
---

# Run: Import preview — see what a file holds and map each folder before anything is saved

> Opened at the start of the session and added to as it goes. Not written at the end.

## What is different now

Choosing a file in Settings → Import no longer saves anything. It shows what the file holds: links found, how many
you already have, how many lines could not be read, and every folder with its full path and link count. Each folder
gets one choice: a new project (name editable), an existing project (picked for you when one has the folder's name),
a tag (name editable), or no project (its links land in Unsorted). The browser's own top folders (Bookmarks bar,
Other Bookmarks, Bookmarks Menu, Mobile) start on No project, the rest on New project. Two switches: keep the file's
tags, and, for Pocket files only, mark links you'd read as Done. Import saves exactly that; Cancel throws it away.
A file with 200 folders keeps them in their own scrolling box, at most half the screen tall.

## Deviations from the plan

1. **The import button reads "Import", not "Import N links".** The count sits beside it: "5 links will be added,
   1 duplicate skipped." T-0012's e2e tests (still being verified on its branch) click a button named exactly
   "Import"; renaming it means editing T-0012's test file here, which would conflict with T-0012's fixes and is a
   test edit this builder should not make. One-line follow-up once T-0012 lands (proposed below).
2. **No multipart.** The plan said the preview and import are multipart. T-0012 refuses multipart on purpose (a
   cross-site form can send it). Instead: the preview sends the file itself as T-0012 does; an import with a
   mapping sends its own type `application/vnd.linksink.import`: one line of JSON options, a newline, then the
   file. Like T-0012's types, a cross-site page can send it only after a CORS preflight. Options are capped at
   512 KB so file + options stay under BODY_SIZE_LIMIT 21M.
3. **The preview is `POST /api/import?preview`, not `/api/import/preview`.** The body-limit hook
   (`src/hooks.server.ts`, outside this task's paths) lets only the exact path `/api/import` past 512 KB; a new path
   would refuse real files with 413. Same route file, so the hook is unchanged.
4. **"With no mapping sent, the defaults apply" holds for the new request type only.** The file posted alone
   (T-0012's request) imports exactly as T-0012 did, because T-0012's API test asserts Chrome's "Other bookmarks"
   becomes a project there, while the new defaults make it No project. An import with options but no entry for a
   folder gets that folder's default.

## Log

- 07:19 Read brief M-2026-10-25-c646dda9, STATE, T-0019, P-T-0019, ADR-0005, T-0012's import code and tests.
  Worktree clean at 9129f76 on t0019-import-mapping.
- Found the three conflicts behind deviations 2–4 before writing code; the fourth (button name) once the T-0012 e2e
  was read.
- 48dfb78 server: parser records each link's full folder path (containers included); `mapping.ts` (folders,
  defaults, preview, option checks, applying a mapping); writer takes existing project ids, re-checked inside the
  write; `uniqueItems` split out of `importItems` so the preview counts duplicates the same way. T-0012's 57 import
  unit tests still green.
- 828ef1b 30 new unit/API tests. Two failed on first run, both wrong expectations in the new test (file order made
  "shelf" the first name met; a URL keeps its trailing slash); corrected.
- cdd2d54 the screen (`ImportPreview.svelte`, loaded on first file choice) and 4 e2e tests. First e2e run: one
  failure, a label lookup matching two fields ("…› Reading" is a prefix of "…› Reading › Long reads"); made exact.
  Then 4/4 in Chromium, 4/4 in WebKit (QA config in the scratchpad, not the ladder). T-0012's 4 e2e tests green
  against the new screen.
- Fixed from the shots: "tags· 1 tag" lost its space; now "Keep the file's tags · 1 tag in it".
- 07:37 First climb green at 1346872 (before the merges below): rungs 0–5 green.
- The orchestrator asked for T-0012's fix round (3bbce56) and main (T-0018) to be merged before the final climb.
  22196f8 merges T-0012: conflicts in import/netscape.ts, write.ts, api.ts. T-0012's versions kept whole (Tokenizer
  parser with a 32-level cap, names checked before any write, ImportStopped); T-0019's folder path, `uniqueItems` and
  existing project ids re-applied on them. The folder path follows the same 32-level cap; a new unit test covers a
  file nested 2,000 deep (one folder, 32 segments, under 1 s). Server unit tests after the merge: 401 passed.
  Main merged cleanly after it (T-0018 touched no Settings file; Shell now has the phone tab bar).
- After both merges: T-0012 + T-0019 e2e 9/9 in Chromium, T-0019 e2e 4/4 in WebKit; the 16 shots retaken.

### Round 2 (brief M-2026-10-25-afa315a9, 08:02)

All three verifiers passed c97c6ed (security M-2026-10-25-cdb1d853, tests M-2026-10-25-c87249d5, QA
M-2026-10-25-3cc04598). This round: tests for four surviving mutants, the button as "Import N links", QA's two items.
The next merge of T-0012 waits for the orchestrator's word.

- 167e91d Four tests, each shown failing with its breakage applied to the code (then the code restored):
  - container attribute ignored (`folder.container[i]` dropped): a German file whose top folders carry
    PERSONAL_TOOLBAR_FOLDER / UNFILED_BOOKMARKS_FOLDER under names no list knows. Failed with the breakage.
  - stored project names not lower-cased in `liveProjects`: an existing project named "READING". Failed.
  - the user filter removed from the writer's re-check of project ids: `importItems` called directly, past
    `checkOptions`, with Bob's project id for Alice. Failed (Bob's project got Alice's link).
  - `uniqueItems` dropping a later copy's project ids: the existing project on the second copy, by `importItems`
    and through the API (Raindrop's Unsorted copy of my-link-2). Both failed.
- 7a83064 The summary counts projects made (`projectsMade`; a project joined is not counted); API tests assert
  1 and 9. The orchestrator added an item (for the person): Raindrop's own "Unsorted" collection now defaults to
  No project ("unsorted" joins the top-folder names). My own defaults row for raindrop.html changed from New
  project to No project to match: a decision changed, not a test weakened.
- 1d5919f The button reads "Import N links". T-0012's e2e: its four locators for the button changed from
  `{ name: 'Import', exact: true }` to `{ name: /^Import [\d,]+ links?$/ }`. That is a selector change; no assertion
  in that file changed. The sentence beside the button now names only the duplicates ("1 duplicate will be skipped:
  already saved, or twice in the file."). "Existing project" fits at 390: the choice select is 156 px on a phone
  (was 136) and 160 px on a desktop (was 148). A new e2e check measures the option's text against the select's
  inner width at 390; at the old 136 px it fails ("fits": false), at 156 px it passes. The summary after Import
  lists "N projects made" when the import made any; e2e test 2 asserts "1 project made".
- Port 4800 was taken by another session's T-0012 server (pid 124788, cwd LinkSink-t0012), so my e2e runs and this
  climb used E2E_PORT=4810. I left that server alone.
- A slip, caught and fixed: to undo the 136 px check I ran `git checkout` on ImportPreview.svelte, which also
  dropped this round's uncommitted edits to that file. I re-applied them (the same diff) and committed;
  the e2e runs after the commit are the ones reported.
- After 1d5919f: T-0012 + T-0019 e2e 9/9 in Chromium, T-0019 e2e 4/4 in WebKit; 18 shots (16 plus the existing row
  at 390 in each browser).
- Not changed: a long project name inside the existing-project select is cut off at 390, as a select cuts its
  text.
## Done when, and what proves it

| Done when | Proof |
|---|---|
| Choosing a file writes nothing, shows links, duplicates, unreadable, every folder (path, count) | API: `mapping.spec.ts` "shows links, duplicates…and writes nothing" compares every table's row count and every synced row+version before/after; e2e test 1 compares the export before/after and checks the four numbers, the unreadable line and folder counts |
| Four choices; defaults (containers → No project, rest → New project, existing name preselected) | Unit table over chrome, firefox, raindrop fixtures + a Bookmarks Menu/Mobile file + existing-name (any case, never another user's) + 64-char cut; e2e tests 1 and 2 check defaults on screen |
| Toggles: keep tags (on), Pocket read → Done (on, Pocket only) | API tests for both on and off; e2e test 3 (switch shown only for the CSV; off → no tags, no status; on → tag kept, Done); e2e test 1 checks it is absent for HTML |
| Import writes exactly the mapping; Cancel discards | API: new renamed, existing, tag, none, shared new name → one project, copies keep both folders' choices, batches of 500 (1,201 links → 3 versions); e2e test 2 (each choice, existing reused not copied, no-project links shown on /unsorted); e2e test 1 (Cancel, nothing written) |
| Mapping checked on the server | 12 API refusals, each 400 with every table unchanged: another user's project, unknown id, deleted project, path not in file, deeper path, overlong project/tag name, blank name, unknown choice, list mapping, non-boolean switch, non-JSON options; plus no options line / empty file |
| Look at 390/1440, light/dark, Chromium/WebKit; 200 folders usable | e2e test 4: no horizontal overflow, folder list scrolls and is ≤ half the viewport, last of 200 folders reachable and changeable; 16 shots (below) |
| Ladder green; first-load JS on / ≤ 60 KB | See Ladder; `npm run size`: / 52.24 KB, /login 46.03 KB, /signup 46.09 KB |

Preview speed: 5,000-link file (0.37 MB, 2,500 already saved): **75 ms** before the merges, **68 ms** after (`[timing]` line in the unit run; the
test fails over 3 s).

## Ladder

Climbed after this report's commit; the result is in the main checkout's `.bonsai/local/ladder/T-0019.json` and in
the report message to the orchestrator (the HEAD it was climbed at is named there).

## What did not work

- The plan's request shapes (multipart, a separate preview path) did not fit T-0012's guard and the body-limit
  hook; see Deviations 2 and 3.
- The button label in the plan collides with T-0012's e2e; see Deviation 1.
- Not built: a "set every folder to…" control. With 200 folders, changing all of them is 200 picks. Proposed below.
- Raindrop's own "Unsorted" collection defaults to a new project called "Unsorted" (the done_when names only browser
  folders). Probably wants No project; proposed below rather than decided here.
- On a phone a long default name ("Reading / Long reads") is cut off inside its field; the field scrolls, the full
  path is on the line above.

## Evidence for a human

Shots (Chromium and WebKit, 390 and 1440, light and dark; `preview-*` is a small browser file, `preview-200-*` the
200-folder file), copied out of test-results to
`/tmp/claude-1000/-home-rohan-Apps-LinkSink/1c6fe8b7-68f5-437e-b03a-9951b9ac25bc/scratchpad/shots/`.
To see it: Settings → Import → Choose a file.

## Files changed

- `src/lib/server/import/types.ts`, `netscape.ts`: each link keeps its full folder path and which folders are
  browser containers.
- `src/lib/server/import/mapping.ts` (new): folders, defaults, preview, option checks, applying a mapping.
- `src/lib/server/import/write.ts`: existing project ids, re-checked inside the write; dedupe split out.
- `src/lib/server/import/api.ts`, `src/routes/api/import/+server.ts`: `?preview`, and the options request type.
- `src/routes/settings/ImportPreview.svelte`, `import-preview.ts` (new), `ImportExport.svelte`: the screen.
- Tests: `src/lib/server/import/mapping.spec.ts` (36), `e2e/t0019-import-mapping.e2e.ts` (4). No existing test edited.

## Processes left running

The e2e servers were started by Playwright and stopped with each run; checked with `ps -eo pid,etime,cmd | grep -E
"e2e-server|playwright|vite"` after the last run (re-checked at the end of the session, see the report message).

## What it cost

About 25 minutes of wall clock to the final climb (07:17 to 07:41), the merges included. Spend: not known; the hours are in
`.bonsai/sessions.md`.

## Left for next time

- After T-0012 lands: rename the button to "Import N links" and change T-0012's e2e clicks to match (small task).
- "Set every folder to…" for files with many folders (proposed task).
- Default Raindrop's "Unsorted" collection to No project (the person's call: a default).
- `/api/import/preview` as its own path needs the hook's list widened (outside this task); not needed now.

## Verifier

> Added by the verifier, in a fresh context. Pass or fail, with reasons.
