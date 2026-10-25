---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-25-T-0012
task: T-0012
role: builder
model: opus
started: 2026-10-25 06:45
finished: 2026-10-25 07:06
outcome: needs-verifier
commits: ["d391bf1", "7e87e70", "57d814d", "f994dd1"]
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

## Verifier

> Added by the verifier, in a fresh context. Pass or fail, with reasons.
