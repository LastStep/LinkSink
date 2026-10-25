---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-25-T-0012
task: T-0012
role: builder
model: opus
started: 2026-10-25 06:45
finished: 2026-10-25 08:47
outcome: needs-verifier
commits: ["d391bf1", "7e87e70", "57d814d", "f994dd1", "91ab57f", "5e8d44c", "836b54a", "38f1220", "d9c6016", "a845284", "277025c", "3bbce56", "b347107", "fae6bf9", "2bcbd9c", "6ca9ac3", "97806a3", "a048dff", "a7ecb3a"]
labels: {}
---

# Run: Export (bookmark HTML and full JSON) and import (bookmark HTML and Pocket CSV)

> Opened at the start of the session and added to as it goes. Not written at the end.

## What is different now

Settings has two new sections. **Export** has two buttons: one downloads a bookmarks file that browsers and
bookmarking tools import, with a folder for each project; the other downloads a JSON file with every link and
everything on it. Archived links are in both; deleted ones are not. **Import** takes a bookmarks file from a browser,
Raindrop, Pinboard or linkding, or Pocket's CSV export. It shows the file's name, size and the format it looks like
before you import. After the import it says how many links were added, how many were skipped as duplicates and which
lines could not be read. Folders become projects (a folder inside a folder becomes "Parent / Child"), tags stay tags,
the saved date is kept, notes come in, and Pocket's read items are marked Done. Details for the new links are then
fetched in the background, two at a time.

## Deviations from the plan

1. **The browser's own top folders are not made into projects.** These are the folders marked as the bookmarks bar
   (`PERSONAL_TOOLBAR_FOLDER`) and Firefox's Other Bookmarks (`UNFILED_BOOKMARKS_FOLDER`). Every bookmark in a
   browser lives inside one of them, so turning them into projects would put most links in a "Bookmarks bar"
   project. The folders inside them do become projects. Chrome's "Other bookmarks" folder carries no such mark, so it
   does become a project. This is a judgement call and needs the orchestrator's or the director's word: removing the
   two-line check in `src/lib/server/import/netscape.ts` (`container`) would make every folder a project.
2. **A second copy of an address in the same file** is skipped and counted as a duplicate, but its tags and folders
   are added to the first copy. Without this, a link in two projects would lose one of them on the way back in,
   because the export lists it once per project. The round-trip tests depend on it.
3. **linkding's archive marker** (the tag `linkding:bookmarks.archived`) archives the link instead of becoming a
   tag. linkding's `[linkding-notes]` markers are taken out of `<DD>`, leaving the description and the notes a blank
   line apart.
4. **"Fresh account" in the e2e test** is the same account with its links cleared, because sign-up closes after
   the one account. A unit test does the round trip into a truly separate user.
5. **Body size.** adapter-node refuses any request body over 512 KB by default, and a 5,000-link file is about
   0.6 MB. I set `BODY_SIZE_LIMIT=21M` in `scripts/e2e-server.js` and `.env.example`. `src/hooks.server.ts` now
   refuses a body over 512 KB on every route except `/api/import`, so the other routes keep their old limit. The
   deploy (T-0005) must set `BODY_SIZE_LIMIT=21M` too, or imports over 512 KB fail with 413 in production.
6. `.prettierignore` gains `src/lib/server/import/fixtures/` (the fixtures are kept byte for byte), as it already
   lists the fetcher's fixtures.

## Log

- 06:45 Read brief M-2026-10-25-bedaf091, STATE, T-0012, P-T-0002 step 10 and Data model, F-web-mvp import/export
  lines. Worktree /home/rohan/Apps/LinkSink-t0012 clean on t0012-export-import at 1d39333. `npm ci` exit 0.
- 06:50 Researcher briefed (M-2026-10-25-36889d92) for the documented shapes of the Pocket CSV and the Netscape HTML
  as Chrome, Firefox, Raindrop, Pinboard and linkding write it. No schema change needed: links, tags, projects,
  link_tags and link_projects already hold every field import and export need.
- 06:52 Researcher report M-2026-10-25-fffd0b0a: linkding, Chromium and Firefox from their source code. Pocket
  (Karakeep's parser and tests), Pinboard (pinefore.com) and Raindrop (two real export lines quoted in forums) from
  secondary sources. Fixtures follow it; `fixtures/README.md` grades each.
- 06:55 d391bf1: parsers (htmlparser2, already a dependency), batch writer, export, routes. svelte-check 0 errors.
- 06:57 7e87e70: 57 unit tests. 3 tests failed on the first run: (a) the shared `expectVersioned` helper assumes a
  call is a single write, but an import is one write per batch, so the import tests use a local `expectBatched`
  check (each changed row newer than the user's version before the call and no newer than after); (b) two of my
  expectations were wrong: `cleanUrl` encodes `"` as `%22`, and a `saveLink` with no `via` is saved as `paste`.
- 07:00 57d814d: Settings sections, and the body-size limit (Deviation 5).
- 07:01 e2e on port 4730 refused: builder@T-0018's `vite dev` (pid 26255) holds it. Not mine, left alone; I used
  `E2E_PORT=4760`. First e2e run: 3 of 4 passed; a `text/plain` post was refused with 403 by SvelteKit's CSRF check
  before it reached my own 415 check. The test now accepts either refusal. Second run: 4 of 4 passed.
- 07:01 Screenshots looked at: the summary lower-cased the format ("pocket export (csv)"), so I reworded it.
- 07:02 to 07:04 ladder climbed, green at f994dd1.

## Ladder

`E2E_PORT=4760 bonsai ladder --task T-0012 --json`, result `.bonsai/local/ladder/T-0012.json` in the main checkout:
`green: true`, `git.sha: f994dd158b289f835c64c1575c7138087a1621ea`, branch `t0012-export-import`, `dirty: false`.

| Rung | Check | Result | Evidence |
|---|---|---|---|
| 0 | guard | green | 30 paths checked, none outside the grant |
| 1 | types | green | `npm run check`: 0 errors, 0 warnings (8.0 s) |
| 2 | lint | green | prettier and eslint pass (11.5 s) |
| 3 | unit | green | 424 tests seen, 0 skipped (main at 1b0add0 had 367; this task adds 57); ratchet ok (29 → 424) |
| 4 | e2e | green | 42 tests (main had 38; this task adds 4), Chromium (94.0 s) |
| 5 | budget | green | first-load JS on `/` 51.95 KB gzipped (main 52.04 KB), `/login` 45.72, `/signup` 45.78; limit 60 KB |

A later climb at the commit that adds this report is quoted in the report message to the orchestrator.

## done_when, one by one

1. **HTML export.** Unit test `HTML: a folder per project ...` checks: a link in two projects appears in both
   folders; links in no project sit at the top level; TAGS="ai,recommendations"; ADD_DATE and LAST_MODIFIED in
   seconds; notes as `<DD>`; markup escaped; deleted links and bob's links absent. The e2e round trip imports a file
   from Settings, downloads the HTML export through its button, clears the links, imports the download, and gets
   the same addresses, titles, tags, projects, notes and dates. In the same test, Chromium's HTML parser
   (`page.setContent`) reads the export into the expected folder and link tree with no `<img>` or `<script>`
   elements (ran). **Not run:** Chromium's and Firefox's own bookmark importers. They cannot be driven from
   Playwright, and Firefox is not installed here. The file copies the header and nesting of both browsers' writers
   (source quoted in M-2026-10-25-fffd0b0a), but whether those browsers accept it is **unverified**: the director
   importing the file into a browser would settle it.
2. **JSON export.** Unit test `JSON: linksink.export/1 ...`: `format`, every column of the links table except
   `userId` present, archived link included, deleted link absent. Two users: alice's export contains no row of
   bob's, and bob's holds only his own link (ran).
3. **Import formats.** `parse.spec.ts` has one table per fixture (Chrome, Firefox, Raindrop, Pinboard, linkding,
   Pocket CSV, and Pocket CSV with its extra `cursor` column) covering folders → projects joined with " / ", TAGS
   → tags, ADD_DATE → created_at, `<DD>` → notes and Pocket `archive` → status done. `api.spec.ts` checks
   saved_via `import` per fixture (ran).
4. **Duplicates, batches, speed.** Duplicates are skipped both against saved links and within the file (unit:
   firefox, raindrop, pocket, chrome re-import). 1,201 links are written in exactly 3 syncWrite versions of
   500/500/201 rows. A 5,000-link file (0.57 MB) imported in 1,362 ms on the first run and 2,026 ms on a later run,
   against a 10 s limit (ran).
5. **Summary and background fetch.** The API answers with added, duplicates, failed and the first 5 failing lines
   (unit). The page shows the summary (e2e, and the screenshots). New links go to `enqueueFetch`
   (`src/lib/server/import/app.ts`). Unit test: 40 imported links through the real `createFetchQueue` never run
   more than 2 at once, and every one is fetched (ran).
6. **Refusals.** Over 20 MB (by content-length and by bytes read), not bookmarks (a web page, JSON, PNG bytes), a
   bookmark file with no links, a CSV quote that never closes, and an empty file are each refused with a message;
   each test also checks that no synced row changed and no version moved (unit). The e2e test covers the page's
   alert for a PNG and for a plain web page, and the server's 400, 413 and 403/415. Markup in a title and a note is
   stored as text (unit). In e2e, a title `<img src=x onerror=...>` shows as text on the list, the details show the
   note `<script>...` as text, no `img[src=x]` exists and `window.__xss` stays undefined (ran).
7. **Settings at 390 and 1440, light and dark.** The e2e test takes all four screenshots and checks that nothing
   runs off the side at 390 (ran; I looked at them).
8. **Ladder and first load.** Green at f994dd1, `/` at 51.95 KB. The import code is in `ImportExport.svelte`,
   loaded only by the Settings page node (the routes the size check measures did not grow).

## What did not work

- Port 4730 from the brief was taken by T-0018's dev server, so every e2e run here used 4760.
- The shared `expectVersioned` helper cannot judge a write split into batches; the import tests carry their own
  check (see Log 06:57). I left the shared helper unchanged.
- Two of my first unit expectations were wrong (Log 06:57), and the 415 e2e expectation was wrong (Log 07:01).
- Fixtures for Pocket, Pinboard and Raindrop rest on secondary sources: Pocket closed in 2025, and none of the three
  publishes a sample file. Firefox's and Raindrop's tag separator (comma) is assumed.
- A file with folders and no links, or one whose only links are not web addresses, is handled differently. No links
  at all is refused. Links that are all non-web (such as `javascript:`) give a summary of 0 added and N failed, and
  nothing is written.

## Evidence for a human

- Screenshots (from the e2e run, copied out of `test-results/`):
  `/tmp/claude-1000/-home-rohan-Apps-LinkSink/1c6fe8b7-68f5-437e-b03a-9951b9ac25bc/scratchpad/screens/settings-390-light.png`,
  `settings-390-dark.png`, `settings-1440-light.png`, `settings-1440-dark.png`, `settings-import-1440-light.png`
  in the same folder.
- See it yourself: open Settings, choose a bookmarks file exported from your browser, press Import; then press
  "Download bookmarks (HTML)" and import that file into a browser.

## Files changed

- Shared: `src/lib/import-format.ts`: format sniffing, the 20 MB limit and labels, used by both server and page.
- Import: `src/lib/server/import/` (`netscape.ts`, `pocket.ts`, `write.ts` the batch writer, `index.ts`
  parse-and-refuse, `api.ts` the request handlers, `app.ts` the app wiring, `types.ts`), fixtures and their README,
  `parse.spec.ts` and `api.spec.ts`.
- Export: `src/lib/server/export.ts`.
- Routes: `src/routes/api/import/+server.ts`, `src/routes/api/export.html/+server.ts`,
  `src/routes/api/export.json/+server.ts`.
- Settings: `src/routes/settings/ImportExport.svelte`, and one line in `+page.svelte` to include it.
- Body size: `src/hooks.server.ts`, `scripts/e2e-server.js`, `.env.example`.
- `.prettierignore`: the fixtures folder.
- e2e: `e2e/t0012-export-import.e2e.ts`. It deletes every link, tag and project it makes, so the e2e files after it
  see the account as it was.
- Not touched: LinkList, Detail, Picker, Shell, `design/tokens.css`, the list routes, the schema.

## Processes left running

None of mine. I checked with `ps -eo pid,etime,cmd` and `ss -ltnp` after the climb: no process from
`LinkSink-t0012`, and nothing on ports 4760 or 4761. Still running and not mine: T-0018's `vite dev` on 4730
(pids 26242, 26254, 26255), left alone.

## What it cost

About 21 minutes of wall-clock time (06:45 to 07:06 UTC), on opus, plus one researcher on sonnet (about 3 minutes).
The session's spend is not known; the hours are the task's rows in `.bonsai/sessions.md`.

## Left for next time

- T-0005 (deploy) must set `BODY_SIZE_LIMIT=21M` in the app container, or imports over 512 KB fail.
- Proposed, not built: Pinboard and linkding `TOREAD="1"` → status `to_read`; Raindrop CSV's `folder` and `note`
  columns; Pocket's older HTML export (`ril_export.html`).
- The director to import the exported HTML into Firefox and Chrome once (done_when 1's browser half).
- Choosing the browsers' top folders as projects or not (Deviation 1).

## Fix round (brief M-2026-10-25-b32f82f3, 07:20 to 07:33)

Both verifiers failed 91ab57f. Each finding is fixed and has a test, and each new test fails when run on 91ab57f's
source (ran: `git archive 91ab57f` unpacked into the scratchpad, the new spec and e2e files copied in, run there).

| Finding | Fix | Test | Fails on 91ab57f? |
|---|---|---|---|
| B1: the same address under "Reading" and "reading" gave a 500 after earlier batches were written | `write.ts`: project names are de-duplicated in any case before writing, and the first spelling is kept (5e8d44c..836b54a) | `fixes.spec.ts` "the same address under Reading and reading...": 200, 2 links, 1 project, 2 joins | yes: 500, `UNIQUE constraint failed: link_projects` |
| B2: a file nested 40,000 folders deep exhausted the server | `netscape.ts` now reads with htmlparser2's `Tokenizer`, which is linear. Its `Parser` keeps open elements with `Array#unshift`/`shift`, so it is quadratic in depth: 13.7 s on that file before any of my code runs. Each folder's path is made once when its list opens, at most 32 levels deep (deeper folders fold into the 32nd), each name cut to 64 characters before it joins (5e8d44c) | `fixes.spec.ts` "nested 40,000 folders deep ... within 2 s": 65 ms now; plus "deeper than 32 levels fold into the 32nd ..." | yes: 5,617 ms; and no fold |
| B3: a chunked body bypassed the 512 KB limit on every route | `src/lib/server/body-limit.ts`, called from `hooks.server.ts`. A body with no stated length is read from a `clone()`, at most 512 KB and one chunk, and refused with 413; a stated length over 512 KB is refused unread. `/api/import` is exempt (38f1220, a845284) | `body-limit.spec.ts` (3 tests); e2e "a chunked body over 512 KB is refused...": 5 MB chunked to `/api/auth/sign-in/email` gives 413, 600 KB chunked to `/api/links` gives 413, 128 KB chunked still reaches the route | yes: e2e on a 91ab57f server, the 5 MB chunked sign-in got 400 (parsed), not 413; the unit spec cannot load (the module is new) |
| Failures part-way | Everything (addresses, names, titles, notes, caps) is checked and normalised before the first write. A batch that fails rolls back; the answer then says "N links were saved. Import the same file again and those are skipped as duplicates", or "nothing was saved" when none were. "Nothing was lost" is gone (836b54a) | `fixes.spec.ts`: a syncWrite failing on its 2nd call gives that message with 500 links, and a re-import adds 700 and skips 500; failing on the 1st call gives "nothing was saved" with no row changed | yes: old message |
| Caps | At most 100 tags a link (the first 100 named), each cut to the 64-character tag-name limit | `fixes.spec.ts` "at most 100 tags...": 150 tags of 84 characters give 100 tags of 64 | yes: 150 |
| Exports | `X-Content-Type-Options: nosniff` on both downloads | `fixes.spec.ts` "send nosniff" | yes: null |

What did not work in this round:
- My first B3 fix hung any over-limit chunked request: `await reader.cancel()` on one branch of a teed stream settles
  only once the other branch is cancelled too. The in-process unit test passed anyway; the real server showed the
  hang. Fixed in a845284 by not awaiting the cancel.
- Ports: 4770 and 4771 are held by a process not mine (pid 58713, an e2e server started from
  `.../scratchpad/t12`, probably a verifier's copy of 91ab57f). I left it alone and used 4780 for the probe server
  and 4790 for the 91ab57f run. The probe server (mine, pid 81834 and earlier 78123) did not stop on SIGTERM:
  adapter-node closes its listener, but the fixture site keeps the process alive. I stopped both with SIGKILL and
  confirmed it with `ss -ltnp`.

## Fix round 2 (brief M-2026-10-25-e43d804d, 07:50 to 08:47)

### C1: what was taking the memory

The background fetch queue alone did not explain it. Measured, in order:
- 10,000 links on a built server (lookups failing at once, as in e2e): peak RSS 1,259 MB, and 750 MB still held
  after every link had failed. A heap snapshot of the idle server is 25 MB, so the held memory is outside the JS
  heap. The snapshot taken at the heap's peak holds 20,004 pending `Timeout` objects and 20,065 `WeakRef`s (about
  two per link, timers left behind by each fetch attempt). It totals 34 MB live; the rest of the 495 MB heap peak
  was garbage.
- 100,000 links under a 1.5 GB heap cap: the server died inside the import request itself, before any background
  work.
- The import's writes alone, outside the server: heap peak 255 MB, but RSS 3.2 GB, growing by 14.5 MB with every
  500-link batch, and a forced GC freed none of it.
- Raw SQLite on one connection, 100,000 rows: reusing one prepared INSERT, RSS +9 MB. A new statement for every
  row (what drizzle does for every query), RSS +1,413 MB, linear, about 14 KB a row, and not given back after a
  forced GC or after `db.close()`. With the FTS5 triggers on `links` dropped, the growth goes away: each INSERT or
  UPDATE on `links` compiles the triggers into its statement.
- better-sqlite3 13.0.3 frees a statement's native memory (`sqlite3_finalize`, `statement.cpp` line 19, through
  `Database::RemoveStatement`) in the JS object's finalizer. The finalizer runs only on a later turn of the event
  loop.

**Cause:** every query prepares a new native statement, about 14 KB with the FTS5 triggers. V8 does not see that
memory, and it is given back only on a later turn of the event loop. Both phases held the loop for their whole run:
- The import wrote every batch in one synchronous call (3.2 GB at 100,000 links).
- The fetch queue chained jobs that fail at once in microtasks. Then 100,000 same-delay retry timers fired in one
  timers phase, each writing a failure (several statements per link) before the loop could turn.

The memory piled up until the process died; health requests timed out while it lasted.

**Fixes:**
- Import: the import no longer queues links itself. It writes them `pending`, gives the loop a turn between batches
  (fae6bf9), and calls `kickFetches()` once.
- Feeder: `src/lib/server/fetch/feeder.ts` reads waiting links from the database by a primary-key cursor, 8 at a
  time, whenever fewer than 4 are queued. The queue therefore holds at most 11 links however many wait.
- Queue: each job starts on its own event-loop turn (`setImmediate`). Its `onRoom` callback tops it up, and it lists
  its queued ids for the feeder (b347107).
- Restart: the server kicks the feeder once when it starts, so work cut off by a restart resumes.
- At most 2 at once is unchanged: T-0007's queue tests pass unchanged.

### Timed runs on a built server, HEAD a7ecb3a

Harness: `.../scratchpad/c1/` (`serve.mjs` starts `build/` the way the e2e server does, `drive.mjs` signs up,
imports, then asks `/login` every second and samples `/proc/<pid>/status`). Both runs used one 100,000-link file:

| Run | File | Import | Background work watched | Health | Peak RSS | Steady RSS |
|---|---|---|---|---|---|---|
| A: lookups fail at once (as in e2e) | 18.6 MB | 200 in 45.0 s | 330 s; 1,312 links failed (twice each) | 330/330 answered, slowest 61 ms | 519 MB (during the import) | about 228 MB, flat |
| B: fake site, 2 s per page | 16.3 MB | 200 in 42.6 s | 330 s; 164 links ok (meta and favicon both wait 2 s) | 330/330 answered, slowest 7 ms | 530 MB (during the import) | about 217 MB, flat |

Before (91ab57f/3bbce56, the verifier's runs): 200 in 17 s, then 5.1 GB and death about 60 s later. The import now
takes longer (45 s against 17 s) because it gives the loop a turn between batches. The files are 18.6 MB and 16.3 MB
rather than a full 20 MB; it is the link count that drives the memory.

### C2

- Both `Math.max(0, ...projects)` spreads are now loops (`write.ts` namer, `organise.ts` createProject).
- The import spreads of a link's tags and projects onto the first copy are loops too.
- One import makes at most 1,000 new projects. The file is refused before any write with "That file would make N
  new projects (one for each folder); one import makes at most 1,000. Nothing was imported."

### Also: an upload over 20 MB answers 413 with its message

- There is no server-wide body limit any more (`BODY_SIZE_LIMIT=Infinity` in the e2e server and `.env.example`).
  `/api/import` reads at most 20 MB, and `hooks.server.ts` holds every other route to 512 KB (B3).
- The import used to *cancel* the body when over 20 MB, which made SvelteKit destroy the socket before the answer
  went out. It now stops reading and releases the stream (a048dff).
- **T-0005 must now set `BODY_SIZE_LIMIT=Infinity`, not 21M.**

### Tests, and what each does on 3bbce56 (ran: `git archive 3bbce56`, the new tests copied in)

| Test | Here | On 3bbce56 |
|---|---|---|
| `feeder.spec.ts` "keeps at most 11 links in the queue while 100,000 wait, and fetches every one, 2 at a time" | pass (100,000 done, max 11 queued, 2 running) | the module does not exist; the counterpart (100,000 imported, queue bound 11) fails: 100,000 queued |
| `feeder.spec.ts` "a run of fetches that fail at once lets timers through" | pass | module missing |
| `feeder.spec.ts` "skips queued, deleted, not pending ..." | pass | module missing |
| `round2.spec.ts` "gives the event loop a turn between batches" | pass | fails: 0 turns (called with 3bbce56's signature) |
| `round2.spec.ts` "1,001 new projects refused, nothing written" | pass | fails: 200 |
| `round2.spec.ts` "1,000 new projects is allowed" | pass | passes (a guard that the cap is not too tight) |
| `round2.spec.ts` "130,000 projects, one more by hand or by import" | pass | fails: `RangeError: Maximum call stack size exceeded` |
| e2e "a chunked body over 512 KB ..." now also: chunked import over 20 MB → 413 and message | pass | fails: connection reset |

My own earlier import tests changed shape with the design: `onCreated` per link became `onImported` once, and the
queue test now goes through the feeder. Every assertion is kept or made stronger.

### What did not work, round 2

- Run B on a second port could not sign up: the build fixes its origin. It ran on 4800 after run A.
- Fetches that fail at once now drain slowly: about 4 links a second, because a failed link waits 2 s for its retry
  inside the 4-link low mark. 100,000 such links would take hours. Memory stays flat and the server answers
  throughout. A link that fails slowly or succeeds is limited by its fetch time instead (run B: about 0.5 a second
  at 2 s a page, 2 pages each).
- The import of the largest file still peaks at about 520 MB RSS (parsing 100,000 links and writing them); it falls
  back afterwards.

### Processes, round 2

All mine were stopped by pid: probe and run servers 120883, 124788, 127175 (died by itself), 142021, 142022 and
146900, then checked with `ss -ltnp` and `pgrep`. Not mine and left alone: pid 58713 (an e2e server from
`.../scratchpad/t12`) and pids 153531/153532 (an e2e server from `LinkSink-t0009`).

## Verifier

> Added by the verifier, in a fresh context. Pass or fail, with reasons.
