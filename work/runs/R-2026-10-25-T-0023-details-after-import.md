---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-25-T-0023
task: T-0023
role: builder
model: sonnet
started: 2026-10-25 13:56
finished: 2026-10-25 15:05
outcome: verify
commits: ["a4eacef", "bc9e11f", "829fd2f", "8ecee76"]
labels: {}
---

# Run: Details fetched after an import show up on the open page, with a line saying how many are still being fetched

## What is different now

After an import, the list you have open fills in each link's title, icon and preview as the server fetches them, with no
reload. A line under the paste box reads "Fetching details: 120 left", counts down, and goes away when nothing is left.
Opening LinkSink while some links still wait also starts it. Screenshots: `R-2026-10-25-T-0023-shots/`
(`list-fetching-1440-light.png`, `list-fetched-1440-light.png`).

## Deviations from the plan

None (light lane, no plan). Two choices to check:
- The existing API has no "how many wait" figure, so the count comes from reading the library through `GET /api/links?limit=200`
  (newest saved first, pages followed with `after`, at most 5 pages = 1,000 links). Past 1,000 links the line reads "N+ left".
  No endpoint changed. A proper count needs an endpoint (T-0010's sync cursor will give it): say if you want that instead.
- The watch is off in `createApiStore` unless `watchLibrary` is passed (src/lib/store/index.ts passes it), so the existing
  store tests that count requests are untouched.

## Ladder

`bonsai ladder --task T-0023 --json`, green, `git.sha` 8ecee76 (result: ladder2.json in the scratch folder; Bonsai's copy in the main checkout's `.bonsai/local/ladder/T-0023.json`):

| Rung | Check | Result | Evidence |
|---|---|---|---|
| 0 | guard | green | |
| 1 | types | green | |
| 2 | lint | green | |
| 3 | unit | green | 645 tests seen (624 on main before this round) |
| 4 | e2e | green | 70 seen (67 before this round's 3 new) |
| 5 | budget | green | `/` first load 59.25 KB of 60 (was 58.22; +1.03 KB, from this and T-0025) |

done_when, each with its proof:
1. Fills in with no reload: e2e `t0023-details-after-import.e2e.ts` ("after an import, the open list fills in titles and previews with no reload"): imports 8 fixture-site links from Settings, goes to the list by the sidebar, `reloads` stays 0, every row ends with the page's title, an icon and `data-meta="ok"`. Unit: `details.spec.ts` "fills in a row that is on screen".
2. Count line: same e2e: `Fetching details: N left` visible, the numbers it shows strictly fall, then the line is gone (count 0). Unit: "counts the waiting links, asks again while any waits, then stops".
3. Polling stops / hidden tab: `details.spec.ts` "looks once when nothing waits", "asks no faster than once every 10 s in a hidden tab", "is one watch however often it is checked". Honest note: one look happens on each page load and when a list shows a waiting link, because that is how it finds out something waits; it keeps asking (every 3 s, 10 s hidden) only while some link waits.
4. Existing API only: yes, `GET /api/links` with `limit` and `after`, both already supported.
5. Ladder: above.

## What did not work

- First e2e wrote link titles into the bookmarks file; the importer marks them as the person's own, so the page's title never replaced them. The test now imports links with no title.
- First full-ladder climb: red on e2e twice. My line had `role="status"`, which made `getByRole('status')` in t0006 ambiguous (now `aria-live="polite"` instead); and the e2e's links carried 2023 dates, so they were not on the first page of a list full of other tests' links (now dated now).
- The e2e waited a long time on the shared Playwright lock (other builders).

## Evidence for a human

Run `E2E_PORT=4930 npx playwright test e2e/t0023`, or import a bookmarks file and open Links: the line appears and counts down.

## Files changed

- src/lib/store/details.ts (new): the watch, easy to remove with its few lines in api.ts when T-0010 lands.
- src/lib/store/api.ts, types.ts, index.ts: rows updated from the scan, `detailsLeft`, `checkDetails()`, option `watchLibrary`.
- src/lib/ui/LinkList.svelte: the "Fetching details" line.
- src/routes/settings/ImportExport.svelte: asks the store to look after an import.
- scripts/e2e-fixtures.js: the fixture page answers with a query string too (for distinct fixture links).
- src/lib/store/details.spec.ts, e2e/t0023-details-after-import.e2e.ts: new tests.

## Processes left running

None. `ps -eo pid,etime,cmd` shows no playwright, vite, node server or flock of mine (the other builders' runs are theirs).

## What it cost

Not known; sessions table has the hours. Message M-2026-10-25-957bb4c6, sonnet.

## Left for next time

- A way to fetch details again for failed links (out of scope, proposed).
- A server count of waiting links would replace the 1,000-link scan (with T-0010).

## Verifier

> Added by the verifier, in a fresh context. Pass or fail, with reasons.
