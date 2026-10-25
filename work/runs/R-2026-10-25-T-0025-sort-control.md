---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-25-T-0025
task: T-0025
role: builder
model: sonnet
started: 2026-10-25 14:10
finished: 2026-10-25 15:05
outcome: merged
commits: ["bc9e11f", "829fd2f", "8ecee76"]
labels: {}
---

# Run: A sort control beside the filters, sorting by status and priority as well as dates and title

## What is different now

On every list screen there is a "sort" control right after the Filters button, showing the current order (Date saved to
start with). It offers Date saved, Last edited, Last opened, Title, Priority and Status and changes the list at once; the
choice is kept in the address (`?sort=status`). Status puts To read, then In progress, then Done, then links with no
status, each group under its own heading; Last opened lists links by the day you opened them, never-opened links last under
"Never opened". The filter panel's own Sort row stays and always shows the same choice. Screenshots:
`R-2026-10-25-T-0025-shots/` (saved and status, 1440 and 390 wide, light and dark).

## Deviations from the plan

None (light lane). Choices: the control is a native select (no script weight, and a phone shows its own picker); the
panel's Sort row stays, as the task allows, so the existing t0009 e2e that uses it is untouched. Named "Order by" so
it does not clash with that row's "Sort" name.

## Ladder

`bonsai ladder --task T-0025 --json` at 8ecee76: green, rungs 0 to 5 (unit 645, e2e 70), the same as T-0023's climb.

| Rung | Check | Result | Evidence |
|---|---|---|---|
| 0-5 | guard, types, lint, unit, e2e, budget | green | see the T-0023 report; `/` first load 59.25 KB of 60 (was 58.22) |

done_when:
1. Control beside the filter button, desktop and phone, shows the current sort, acts at once: e2e `t0025-sort-control.e2e.ts` (both tests): checks its position next to Filters at 1440 and 390 wide, `toHaveValue`, and `loads` stays 0 on changes.
2. Six sorts, Status in the status list's order and none last, kept in the address: unit `search-sorts.spec.ts` (server order and keyset paging across 115 links, same order as the client comparator), `sorts.spec.ts` (labels, address both ways, ranks); e2e selects each sort and checks the URL and order.
3. Panel row and "Sorted by" chip agree: e2e changes the panel row and sees the control change, and the reverse.
4. Unit tests per new order and an e2e: as above.
5. Ladder: above.

## What did not work

- First e2e run: choosing Status gave a 500 page. The list groups rows by priority/status assuming rows arrive in the sort's order; for a moment after the choice they were still in the old order, so a group appeared twice and Svelte threw a duplicate key error. The grouped sorts now put rows in their own order first (an existing weakness for the priority sort too).
- The phone picker is a native select, so its open list looks like the phone's own, not the app's.

## Evidence for a human

Open `/?sort=status`, or `/?sort=opened`. Shots in the folder named above.

## Files changed

- src/lib/search/filters.ts: two sorts, labels, `statusRank`, comparators.
- src/lib/server/search.ts: the same two orders in SQL, with keyset cursors.
- src/lib/ui/LinkList.svelte: the control, groups for Status and Last opened, time column.
- src/lib/ui/Icon.svelte: a sort icon.
- src/lib/search/sorts.spec.ts, src/lib/server/search-sorts.spec.ts, e2e/t0025-sort-control.e2e.ts: new tests.

## Processes left running

None (checked with `ps -eo pid,etime,cmd`).

## What it cost

Not known; see the sessions table. Message M-2026-10-25-957bb4c6, sonnet.

## Left for next time

The person may change the list of sorts when they look. The board view (T-0026) will need to know the new sorts.

## Verifier

> Added by the verifier, in a fresh context. Pass or fail, with reasons.

## Landing (orchestrator, 2026-10-25 16:30 UTC)

- **Round:** this task landed with six others in one combined round (the person: "only run one verifier for all
  combined"): T-0029, T-0022, T-0027, T-0028, T-0023, T-0025, T-0030, merged into combined-2026-10-25 and from there
  no-ff into main as e51a96e.
- **Verifier (one, four lenses):** FAIL M-2026-10-25-6a8d2866 at 6d4b3f6, 2 blocking, both held (deploy/SERVER.md's
  update wording and its deploy-user steps; README's update wording); 0 did not hold. Fix rounds:
  M-2026-10-25-824f9f4e (builder@T-0029, 4efcff0), README 7fd78c1 and make-icons.mjs 19ec036 (orchestrator). Re-check
  PASS M-2026-10-25-6aa15134 at 8b74890.
- **Ladder:** `bonsai ladder --task` for each of the seven at 8b74890, clean, under the shared Playwright lock: rungs
  0-5 green, unit 645, e2e 80, first load on / 58.53 KB of 60. GitHub Actions on the branch: run 40209525137, green.
- **My read of the diff:** each branch's diff against its task before combining; the merge was clean.
