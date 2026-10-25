---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-25-T-0009
task: T-0009
role: builder
model: opus
started: 2026-10-25 08:04
finished: 2026-10-25 08:52
outcome: needs-verifier
commits: ["ee272b6", "09c7f71", "04d5fcc", "2d1916e", "3e59205", "8d872b7", "bf5a9fb", "56622eb"]
labels: {}
---

# Run: Search, filters and keyboard

> Opened at the start of the session and added to as it goes. Not written at the end.

## What is different now

The search box on every list now reads "Filter as you type" and the list follows each keystroke about a tenth of a
second after the last one, with no page load; `/` (or a click on its hint) jumps into it and Esc clears it. Beside it,
a Filters button opens a panel (a sheet on a phone) to pick status and priority (with the same marks as the rows,
"No status" and "No priority" included), media, tags (any or all), projects and source, whether archived links are
left out, included or shown alone, and the sort (date saved, last edited, priority, title). What is picked shows as
chips under the box, each with an x. The whole view lives in the address, so a reload or a bookmark brings it back.
Long lists load 50 at a time as you scroll. On a laptop: `j`/`k` (and the arrows from a row) move, Enter opens,
`e` edits the title, `t` tags, `p` projects, `a` archives, `x` selects, `n` goes to the paste box, and Ctrl/Cmd+K
opens a command palette that saves a pasted link, searches, jumps to a project, tag or source, or goes to Unsorted,
Archive, Projects, Tags or Settings.

## Deviations from the plan

- **The old `toFtsQuery` is kept, unused, with its tests.** The plan's parser puts the prefix on the last word only;
  `toFtsQuery` (every word a prefix) has a unit test that says so. Changing it would mean changing that test, so the
  search path moved to the new parser (`src/lib/search/query.ts`) and `toFtsQuery` stays until a task retires it.
- **`links_fts` keeps its `site_name` column** beyond the six the task names (there since T-0003; dropping it would
  make search find less).
- **One existing test edited:** `src/lib/server/db/open.spec.ts` counts the migrations; 5 became 6 for the new
  migration (as T-0007 and T-0008 did for theirs). No assertion was removed or loosened.
- **Status and priority filters also take "none"** (`status=none`, `priority=none`), since the marks have a "none"
  mark; priority is written by word in the address (`priority=high`), as the plan's example shows.

## Ladder

`bonsai ladder --task T-0009 --json`, result `.bonsai/local/ladder/T-0009.json`: `green: true`, git sha `8d872b7`
(branch t0009-search-filters-keys, not dirty), 08:48:38 to 08:51:40 UTC. This report was committed after that climb;
the final climb at the report's commit is named in the report to the orchestrator.

| Rung | Check | Result | Evidence |
|---|---|---|---|
| 0 | guard | green | 51 paths checked |
| 1 | types | green | `npm run check`, 8.1 s |
| 2 | lint | green | prettier and eslint, 12.0 s |
| 3 | unit | green | 482 tests seen, 0 skipped (STATE gives 367 on main at 1b0add0), 19.0 s |
| 4 | e2e | green | 56 tests seen, 0 skipped (49 before this task + 7 new), 118 s |
| 5 | budget | green | first load `/` 58.23 KB gzipped (limit 60; STATE gives 52.04 on main), `/login` 49.33, `/signup` 49.38 |

The first climb (at 3e59205) went red on rung 4: t0018's "empty Unsorted" test tags one page of Unsorted, and the
62 untagged links this task's e2e made pushed Unsorted past one page of 50. Fixed by having t0009's file delete its
own links at its end (8d872b7); then green.

## Evidence, one line per done_when

1. **links_fts** (unicode61 remove_diacritics 2, prefix '2 3', six columns, live links only, triggers): migration
   `drizzle/0005_links_fts_live.sql`; `src/lib/server/search.spec.ts` "links_fts holds live links only" (delete,
   restore, edit of a tombstone, hard delete, reindex, DDL) and "the 0005 migration on a database with links in it".
   `GET /api/links?q=` serves it (`src/lib/server/api/links.ts`). ran.
2. **One parser in src/lib/search/** with a unit table: `query.spec.ts` (17 rows of input, terms and FTS5 string; 15
   rows of the client matcher), used by the server (`search.ts`) and the client (the store). A test checks that the
   server and the client agree on every row of the filter table. ran.
3. **Within 150 ms, no page load**: e2e "results follow each keystroke…": keystroke to results **103 to 115 ms** over
   five queries in each of five runs (last: `104, 109, 112, 110, 109`), each sample asserted ≤ 150 ms; the same window
   object survives the typing. ran (Chromium).
4. **Filters combine, archived rule, in the URL, reload reproduces**: unit table in `search.spec.ts` (27 rows, the SQL
   builder) and `filters.spec.ts` (address read and write, round trip, client check); e2e "filters combine…" (any
   within, all across, the tags all switch, archived include and only, reload with chips). ran.
5. **Keyset paging, 50 a page, four sorts**: unit "pages by keyset…" (119 links, pages 50/50/19 in each sort, no row
   twice, the same order as the client comparator); e2e "sort … and paging" (62 links: 50, then 62 on scroll). ran.
6. **Keys and the palette**: e2e "keys: / n j k arrows Enter e t p a x" and "Ctrl/Cmd+K opens the palette…" (add,
   search from Settings, project, tag, source, Unsorted, Archive, Settings). ran (Chromium).
7. **ADR-0005 at 390 and 1440, light and dark, Chromium and WebKit**: 28 shots in
   `work/runs/R-2026-10-25-T-0009-shots/` (`<state>-<width>-<theme>-<engine>.png`; states list-filtered, filters,
   palette (1440 only: there is no keyboard shortcut on a phone), no-match). Placeholder "Filter as you type", `/`
   focuses (e2e), status and priority filters and chips use StateMark (e2e counts the marks). WebKit by shots only
   (the e2e rung is Chromium only). ran.
8. **Ladder green at HEAD, first load within 60 KB**: above; the panel (`FilterPanel.svelte`) and the palette
   (`Palette.svelte`) load with `import()` on first use. ran.

## What did not work

- First climb red (rung 4), as above: an older test needs Unsorted to fit in one page; the API's default page fell
  from 200 to 50 with this task. My e2e now cleans up after itself; the older test stays as it is, still fragile if a
  later file leaves 50 or more untagged links.
- Four of my own e2e expectations were wrong on first run (row order, a phrase case, an empty-state sentence, and
  whether a link that stops matching stays while open); fixed in the tests. One was a real bug: `e` did not focus the
  title (the details mount a frame later); it now waits for the field.
- At 390 the Filters button first ran off the screen's right edge (seen in a shot); on a phone it is now its icon and
  its count.
- The first-load budget is tighter: 58.23 of 60 KB. The next feature on the list screen will have to load lazily.
- Keystroke to results is 3 to 15 ms over the 100 ms debounce on this machine with a small database; not measured at
  50,000 links (that is T-0013).

## Decisions taken inside the task

- **A link that stops matching a filtered list leaves it at once**, the rule T-0015 set for views: its open details
  stay open and working (it is held). Tested in the store unit test and in e2e.
- **A paste on a filtered list that does not match** is saved, and the page says "Saved. It does not match the search
  or filters on screen, so it is not shown." Filters are not applied to the new link (only a tag's or project's own
  page joins it, as T-0017 made).
- Sort by priority groups rows under "High priority" and so on; by title under "A to Z" with the day saved in place of
  the time; by edited, by the day edited.
- `GET /api/links` takes `limit` (up to 200, default 50) and `after` (the previous page's `next`), and returns `next`
  and `total` beside `links` and `counts`.

## Evidence for a human

- Shots: `work/runs/R-2026-10-25-T-0009-shots/`, e.g. `filters-1440-light-chromium.png`,
  `list-filtered-390-dark-webkit.png`, `filters-390-dark-webkit.png`, `palette-1440-light-webkit.png`.
- To try it: `E2E_PORT=4840 npx playwright test e2e/t0009-search.e2e.ts`, or open the app, type in the search box,
  press `/`, then Ctrl+K.

## Files changed

- Search core: `src/lib/search/query.ts` (parser, FTS5 string, client matcher), `src/lib/search/filters.ts` (filters,
  their address form, the client check, sort order), and their specs.
- Server: `src/lib/server/search.ts` (one SQL query, keyset paging, `reindexLinks`), `src/lib/server/links.ts`
  (`listLinks` goes through it), `src/lib/server/api/links.ts` (GET takes the filters, `after`, `limit`),
  `drizzle/0005_links_fts_live.sql` with its journal entry and snapshot, `src/lib/server/search.spec.ts`,
  `src/lib/server/db/open.spec.ts` (migration count).
- Store: `src/lib/store/types.ts` (`belongsToList`, filters in the state, `search`, `more`), `src/lib/store/api.ts`,
  `src/lib/store/search.spec.ts`.
- Screens: `src/lib/ui/LinkList.svelte` (search box, debounce, address, chips and panel, paging, keys),
  `src/lib/ui/FilterPanel.svelte` (new, lazy), `src/lib/ui/Palette.svelte` (new, lazy), `src/lib/ui/Shell.svelte`
  (Ctrl/Cmd+K), `src/lib/ui/Icon.svelte` (filter icon), `src/lib/ui/format.ts` (`shortDate`).
- Tests: `e2e/t0009-search.e2e.ts` (7 tests). Shots: `work/runs/R-2026-10-25-T-0009-shots/` (28 files, 2.9 MB).

## Processes left running

None. Every server was Playwright's own `webServer` (ports 4840, 4850 and the ladder's), stopped as each run ended;
`ss -ltnp` showed nothing listening on 48xx or 4173, and `ps -eo pid,etime,cmd` showed no e2e-server, vite or
playwright process after the last run.

## What it cost

About 50 minutes of wall-clock (08:04 to 08:52 UTC), one builder session on opus, brief M-2026-10-25-342d8204; the
session's spend is in `.bonsai/sessions.md`, not typed here.

## Left for next time

- Retire `toFtsQuery` and its test (a task that owns tests).
- t0018's "empty Unsorted" e2e tags only the first page of Unsorted; it breaks if 50 or more untagged links exist
  when it runs. Proposed: page through, or ask with `limit=200`.
- The palette has no button on a phone (the one-pager asks for it on desktop only).
- An index for sort by edited (`user_id, updated_at`) if T-0013 finds that sort slow at 50,000 links.

## Fix round (brief M-2026-10-25-76c4ef9e)

QA failed one thing (M-2026-10-25-3447f5c0): a click or tap on the `/` hint did nothing. The click focused the hint
button, the box's `:focus-within` rule then hid the hint, and the click never reached the box. Now the hint's
mousedown keeps focus off it and puts it in the box; the click does the same for taps. On touch screens and at
phone width the hint is not shown (no keyboard). Also, from the verifiers:

| Test | What it now proves | Fails when its fix is undone (ran) |
|---|---|---|
| e2e "a click on the / hint puts the cursor in the search box; a phone shows no hint" (new) | a click focuses the box and typing lands there; no hint at 390 | at bf5a9fb: "toBeFocused … Received: inactive"; with the phone CSS removed: "toBeHidden … Received: visible" |
| store "drops an older answer that arrives after a newer search" | answers released newest first, then the old one: the list keeps the newer | with the `call !== listCall` check removed: 1 failed |
| store "keeps the sort when a link changes" | the fixture's saved order differs from title order | with the comparator forced to date saved: 1 failed |
| server "pages by keyset…" | every fifth title is "Same title"; the client comparator is checked from reversed input | with the title sort's id tie-break removed: 1 failed |
| e2e t0018 "…an empty Unsorted say so…" (fetch only; its assertion unchanged) | reads every page of Unsorted before tagging | with t0009's cleanup off (62+ untagged links): old version 1 failed, new version 19 passed |

Playwright runs and the ladder ran under the shared flock (`scratchpad/playwright.lock`).

## Verifier

> Added by the verifier, in a fresh context. Pass or fail, with reasons.

## Landing (orchestrator, 2026-10-25 10:24 UTC)

- **Briefs:**
  - M-2026-10-25-342d8204 (the build);
  - fix round M-2026-10-25-76c4ef9e;
  - lint after merge M-2026-10-25-7d821957.
  - Reports: M-2026-10-25-84e4385a, M-2026-10-25-0d506440 and M-2026-10-25-76f9f80d.
- **Security:** PASS M-2026-10-25-97c4921a at bf5a9fb.
- **Tests:** PASS M-2026-10-25-b55a521d at bf5a9fb.
- **QA:**
  - FAIL M-2026-10-25-3447f5c0 at bf5a9fb (held: the "/" hint click; the focus-within rule hides it before the click).
  - PASS M-2026-10-25-0a1fc2ab at c9b8303.
- **Blocking findings:** 1 held, 0 did not hold.
- **The orchestrator's read:**
  - the fix round's test changes, including the t0018 empty-Unsorted e2e: it now reads every page, with the assertion unchanged;
  - the merge of main (c52b2f6, clean);
  - the two spread-to-loop lint fixes.
- **Merged:** no-ff into main as c2bece2, after T-0012 and T-0019. `bonsai ladder --task T-0009` on main at c2bece2 (clean, under the shared Playwright lock): rungs 0-5 green, unit 624, e2e 67. First load: / 58.22 KB, /login 49.34, /signup 49.4 (limit 60).
- **Status:** T-0009 → verify. The person tests it at the end.
- **Carried and proposed:**
  - retire toFtsQuery;
  - an index for sorting by edited, if T-0013 finds it slow;
  - pushState for filter history (Back currently skips earlier filters);
  - the budget is tight: the next list feature loads lazily.
