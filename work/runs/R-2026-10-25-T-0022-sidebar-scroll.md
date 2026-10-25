---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-25-T-0022
task: T-0022
role: builder
model: sonnet
started: 2026-10-25 19:30
finished: 2026-10-25 15:00
outcome: merged
commits: ["e2c5e7b", "739ce31", "437f890"]
labels: {}
---

# Run: T-0022 (sidebar-scroll)

> Opened at the start and added to as it goes. One branch (t0022-sidebar-rename-icon) carries T-0022, T-0027, T-0028.

## What is different now

On a wide screen the sidebar's project list now scrolls inside its own area. The top part (Links, Unsorted, Archive,
Tags, the "Projects" label) and the bottom part (Settings, Log out) stay where they are, so with 300 projects Settings
is still at the bottom of the window. With a few projects nothing moves.

## Deviations from the brief

- None for the task itself. One shared note for the round: my first screenshot run left its server and script alive
  (SIGTERM was ignored by the e2e server), which held the shared Playwright lock for about 35 minutes and blocked the
  other builders. I stopped both (pids 802857 and 802864, both started by me); the script now kills with SIGKILL.

## Evidence

| done_when | Evidence |
|---|---|
| 300 projects: the list scrolls inside its own area; Settings and the controls below stay visible and fixed (1440x900 and 1280x720) | e2e `e2e/t0022-sidebar-scroll.e2e.ts`: "at 1440x900 ..." and "at 1280x720 ..." (ran: 2 passed). They read the sidebar's own scroll (`aside.side` does not scroll, the list does), that Settings' top and Log out's bottom do not move when the list is scrolled to its end, and that New project, Settings and Log out are in the viewport. Shots: `R-2026-10-25-T-0022-sidebar-scroll-shots/before-sidebar-300-*` (Settings pushed out) and `after-sidebar-300-*` (light and dark, 1440 and 1280) |
| a few projects: nothing moves (before and after screenshots) | `before-sidebar-few-1440-{light,dark}.png` vs `after-sidebar-few-1440-{light,dark}.png`; a pixel compare of the 256 px sidebar strip finds differences only in the three colour dots (x 22 to 29), because my shot script's palette changed between the two runs; no row, label or button moved. e2e "with a few projects the sidebar is as it was" (ran, passed): the sidebar does not scroll, Log out ends within 24 px of the window bottom |
| the keyboard reaches every project in order; the list scrolls to the focused one | e2e "the keyboard reaches the projects in order ...": all 300 created projects are in the sidebar in creation order; 40 Tab presses from the first row land on each next row in turn; the list's scrollTop is above 0 and the focused row is inside the list's box (ran, passed) |
| the ladder climbs green at HEAD | `bonsai ladder --task T-0022 --json`, result in `.bonsai/local/ladder/T-0022.json` (numbers in the report message) |

Change: `src/lib/ui/Shell.svelte` only (CSS: the Projects nav takes `flex: 0 1 auto; min-height: 0; overflow-y: auto`,
rows `flex: none` so they do not squeeze, and a 3 px padding with an equal negative margin so a focus ring is not cut).
The menu sheet on narrow screens shares the same snippet, so its list scrolls the same way.

## What did not work

- First version squeezed the rows (the flex column shrank every row to 22 px); caught in my own screenshot, fixed with
  `flex: none`.
- First padding trick moved the list 3 px; fixed with a matching negative margin on all sides.
- The "before" shots have fewer projects than the "after" ones: my script gave some projects colours the app does not
  have, so those creates failed (about 20 of 300 missing). Both are far past the window height.

## What it cost

About 1 h 20 min wall clock, most of it waiting for the shared Playwright lock.

## Processes left running

none (checked with `ps -eo pid,etime,cmd`; my e2e servers on 4920/4921 are gone).

## What is next

The one verifier for the round checks this with T-0027 and T-0028.

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
