---
format: bonsai.run/1
id: R-2026-10-24-T-0017-paste-into-view
task: T-0017
role: builder
model: sonnet
started: 2026-10-24 22:59
finished: 2026-10-24 23:40
outcome: blocked
commits: [bb5e44c]
labels: {}
---

# Run: a link added on a tag's or project's page joins it

## What is different now

Adding or pasting a link on a tag's or a project's page saves it with that tag or project in the same write, so its row
stays. Pasting an address already saved there adds the tag or project to the existing link and still shows "Already
saved." Paused by the person before the final proof.

## Where I stopped (paused by the person)

- Done and committed (bb5e44c): `addLink`/`saveLink` take `tagIds`/`projectIds` (one `syncWrite`, ids checked as the user's
  own, a duplicate gets the union); POST /api/links accepts both (non-list is 400); `NewLinkInput` and the optimistic row
  carry the ids; counts do not bump Unsorted on a join and refresh after; `LinkList` passes the view's tag or project.
  Tests added: 3 API tests in `links.spec.ts` (one version for link and joins, refusals of unknown or another user's
  ids, duplicate union) and 4 e2e in `e2e/t0017-paste-into-view.e2e.ts`.
- Last complete ladder (ran, on the same code, before the commit, tree uncommitted): rungs 0-5 green, unit 367 (was 364),
  e2e 38 (was 34), 0 skipped, budget rung green (first-load size not read from the output; run `npm run size`).
- Not done: the ladder at the committed HEAD (a second climb was started and cancelled at the pause, no result), this
  report's size line, STATE.
- Note: the paste has no undo toast today; "undo of the paste" in done_when was read as delete then Undo of a pasted
  link, which the e2e covers (it returns into the project).

## Processes left running

none; the cancelled climb's processes are gone (ps checked).

## Landing (orchestrator, 2026-10-24 20:10 UTC)

- Brief M-2026-10-24-28056afb; pause brief M-2026-10-24-02caf2bf; builder report M-2026-10-24-bf4d5461 (blocked:
  paused, HEAD 995d80c, climb at HEAD not run).
- Light lane: no verifiers. The orchestrator read the diff. The tag and project ids join in the same sync write;
  setOrganising and patchLink check ownership (checkOwned); a duplicate gets the union of what it had and the view's
  tag or project. API tests cover one version, refusal of unknown or another user's ids, and the duplicate.
- Merged no-ff into main as 8ded31c. The first climb there went red at lint, on the orchestrator's own unformatted
  design/options/T-0016/measures-rows.json (not T-0017's code). Formatted in 1b0add0.
- `bonsai ladder --task T-0017` on main at 1b0add0 (clean): rungs 0-5 green, unit 367, e2e 38, 0 skipped; first
  load `/` 52.04 KB gzipped (limit 60). Leftovers named (pids 1696, 1753, 1754) are the Notion MCP server, not ours.
- T-0017 → done (light lane).
