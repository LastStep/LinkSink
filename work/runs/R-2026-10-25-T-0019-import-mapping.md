---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-25-T-0019
task: T-0019
role: builder
model: opus
started: 2026-10-25 07:19
finished: 2026-10-25 10:10
outcome: needs-verifier
commits: ["48dfb78", "828ef1b", "cdd2d54", "1346872", "22196f8", "ed6cc0e", "48d9120", "c97c6ed", "167e91d", "7a83064", "1d5919f", "fd7b2d2", "6e31fec", "a793b0a", "523a3f3", "a320577", "9067a28", "08e2851", "9ed4783", "1c872f8", "0338010", "9e9caad", "1fe69ac", "e6572f3", "8c3f1c8"]
labels: {}
---

# Run: Import preview — see what a file holds and map each folder before anything is saved

> Opened at the start of the session and added to as it goes. Not written at the end.

## What is different now

Choosing a file in Settings → Import no longer saves anything. It shows what the file holds: links found, how many
you already have, how many lines could not be read, and every folder with its full path and link count. Each folder
gets one choice: a new project (name editable), an existing project (picked for you when one has the folder's name),
a tag (name editable), or no project (its links land in Unsorted). The browser's own top folders (Bookmarks bar,
Other Bookmarks, Bookmarks Menu, Mobile, and Raindrop's own Unsorted) start on No project, the rest on New project. Two switches: keep the file's
tags, and, for Pocket files only, mark links you'd read as Done. Import saves exactly that; Cancel throws it away.
A file with 200 folders keeps them in their own scrolling box, at most half the screen tall.

## Deviations from the plan

1. **(Closed in round 2: the button now reads "Import N links", 1d5919f.)** **The import button read "Import", not "Import N links".** The count sits beside it: "5 links will be added,
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
### Round 3 (brief M-2026-10-25-4fbfb516): merge T-0012's fix round 2 (b49f6c5)

- a793b0a Merge. Conflicts in import/write.ts and import/api.ts, each resolved by taking T-0012's file whole and
  re-applying T-0019's changes on top:
  - write.ts: T-0012's async `importItems(db, …)` (links saved waiting for the feeder, a yield between batches,
    loops instead of spreads, the 1,000 new-project cap checked before any write) kept. T-0019's parts re-applied:
    `uniqueItems` (now the dedupe and normalising step, still using T-0012's push loops), existing project ids
    (merged across copies, re-checked by user inside the write), `projectsMade`. A mapping's new projects reach the
    writer as project names, so they count toward the cap; tag, none and existing choices do not.
  - api.ts: T-0012's `onImported`, `readCapped` (release, not cancel) and `ImportStopped` handling kept; T-0019's
    preview, options request and `projectsMade` re-applied. The `OPTIONS_MAX` comment no longer names the old 21M
    limit (BODY_SIZE_LIMIT is now Infinity; the import reads at most the file's 20 MB plus the options line).
  - My two writer tests moved to the async signature (`await importItems(t.db, …)`); no assertion changed.
- New tests: a 1,001-folder file on defaults is refused before any write ("1,001 new projects"), and allowed once
  two folders share one new name (1,000 made); tag and none choices make no project toward the cap; the preview
  and the options import both answer a chunked 21 MB body with 413, in a unit test (streamed Request) and in e2e
  against the real server (Transfer-Encoding: chunked, no Content-Length).
- T-0012's test files are unchanged from b49f6c5 except the round-2 selector change in its e2e (checked with
  `git diff b49f6c5`). Server unit tests: 417 passed; T-0012 + T-0019 e2e: 10/10 in Chromium. WebKit not re-run:
  no screen code changed in this merge.

### Round 4 (brief M-2026-10-25-32a2d3a2): merge T-0012's fix round 3 (7d3c4f4)

- a320577 Merge, no conflicts. T-0012's new lint rule (no spread arguments into Math.max/min, push,
  String.fromCharCode/fromCodePoint) finds nothing in T-0019's files: `npx eslint .` clean after the merge. T-0019's
  spreads are array literals (`[...new Set(...)]`), not call arguments.
- The person's new rule: Playwright runs one at a time across agents. This round's climb ran under
  `flock …/scratchpad/playwright.lock`.

- 9067a28 climbed green under the lock (495 unit, 59 e2e). Then the orchestrator moved the merge to T-0012's fix
  round 4 (4fcd938), on top.
- 08e2851 Merge of 4fcd938. One conflict, netscape.ts's import lines: T-0012's limits and T-0019's `ImportFolder`
  both kept. The folder path uses T-0012's cut heading name. mapping.ts now cuts a name's raw text to
  NAME_RAW_MAX before NFKC (as T-0012's writer does), takes NAME_MAX from limits.ts, and refuses a mapping name
  longer than NAME_RAW_MAX before normalising it. The preview goes through `parseImport`, so T-0012's field cuts
  and 100,000-link cap apply to it.
- New tests: the preview refuses 100,001 links (400, nothing written); a 1 MB folder heading previews in under 2 s
  with its name cut to 64; a default name of U+FDFA characters stays within 64; a mapping name of 100,000 U+FDFA is
  refused with nothing written. That last test also passes with the raw-length check switched off (options are
  capped at 512 KB, so normalising first is quick too): it proves the refusal, not which check made it. The
  check stays as a bound before NFKC.
- T-0012's test files are unchanged from 4fcd938 except the round-2 selector change. Server unit tests: 441 passed.
- Climb at 9ed4783: red at rung 0. The guard refused `.bonsai/sessions.md` and `.bonsai/tasks.md` against base
  4fcd938: T-0012 had landed on main (042eceb), so the base moved, and my branch held the older main copies of
  those generated tables (from the T-0018 merge). I did not edit them. Fix: 1c872f8 merges current main, which
  carries T-0012's landing; both tables now equal main's, and the merge changed no code (records only). Not taken:
  the guard's suggested `git checkout 4fcd938 -- <path>`, which would have rolled main's tables back.

- The climb at 9e9caad was green (read afterwards from the ladder result): 515 unit, 59 e2e.

### Round 5 (brief M-2026-10-25-6db50f15): Raindrop's Unsorted only

- 1fe69ac merges main for done_when 2's new wording: Raindrop's own Unsorted defaults to No project in a Raindrop
  file only; a folder named Unsorted in any other file defaults to New project.
- Tests first: Chrome and Firefox files with a top-level "Unsorted" folder start on New project. Both failed on the
  code as at 9e9caad (mapping.ts unchanged since), as the brief asked.
- e6572f3 The parser marks a Raindrop file (`raindrop`) by its header (`<TITLE>`/`<H1>` "Raindrop.io…" in the
  first 2 KB) or any DATA-COVER attribute, which only Raindrop writes; `ParsedFile.raindrop` carries it. "unsorted"
  left the general top-folder names; `containers()` takes it as a top folder only in a Raindrop file, at depth 0.
  Tests: the fixture, a file known by its title only, one known by DATA-COVER only, and an Unsorted inside a
  collection (stays the person's). Switching off detection, or either marker alone, turns a test red. My defaults
  table now passes the parsed file's flag to `foldersOf`; its rows are unchanged.
- 8c3f1c8 The optional item: a test that the folder heading is read only to FIELD_MAX.folder (256): a heading of
  "a", 300 spaces, "b" gives the folder "a". With the cap removed (`heading.name += chunk`) it reads "a b" and the
  test fails.
- Server unit tests: 446 passed.

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
  folders). Probably wants No project; proposed below rather than decided here. (Round 2: done, the orchestrator's
  call for the person.)
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

- ~~Rename the button to "Import N links"~~: done in round 2 (1d5919f).
- "Set every folder to…" for files with many folders (proposed task).
- ~~Default Raindrop's "Unsorted" collection to No project~~: done in round 2 (7a83064).
- ~~Merge T-0012's fix round 2~~: done in round 3 (a793b0a).
- `/api/import/preview` as its own path needs the hook's list widened (outside this task); not needed now.

## Verifier

> Added by the verifier, in a fresh context. Pass or fail, with reasons.

## Landing (orchestrator, 2026-10-25 10:20 UTC)

- **Briefs:**
  - M-2026-10-25-c646dda9 (the build);
  - rounds M-2026-10-25-afa315a9, M-2026-10-25-4fbfb516, M-2026-10-25-32a2d3a2 and M-2026-10-25-6db50f15.
  - Last report: M-2026-10-25-cfde1e5c.
- **Security:** PASS M-2026-10-25-cdb1d853 at c97c6ed.
- **QA:** PASS M-2026-10-25-3cc04598 at c97c6ed.
- **Tests (verifier@T-0019#2):**
  - PASS M-2026-10-25-c87249d5 at c97c6ed.
  - FAIL M-2026-10-25-423bd975 at 9e9caad (held: "Unsorted" matched by name in any file, against done_when 2). done_when 2 was amended to Raindrop files only, as the orchestrator's default.
- **Round 5 at f642e83:** read by the orchestrator, not re-verified (a small change that fixes exactly the held finding). The tests were written first and failed at 9e9caad.
- **Blocking findings:** 1 held, 0 did not hold.
- **Merged:** no-ff into main as 153c7d5. `bonsai ladder --task T-0019` on main at 153c7d5 (clean, under the shared Playwright lock): rungs 0-5 green, unit 520, e2e 59.
- **Status:** T-0019 → verify. The person tests it at the end with a real bookmarks export.
- **Proposed follow-ups:**
  - a "set every folder to…" control;
  - fewer tab stops with many folders.
