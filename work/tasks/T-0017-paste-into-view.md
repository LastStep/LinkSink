---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0017
title: A link pasted on a tag's or a project's page joins that tag or project
status: done
lane: light
done_when:
  - "Pasting or adding a new link on /tags/<id> saves it with that tag, and its row stays in the list; same for /projects/<id> with that project (e2e for each)"
  - "The tag or project is set in the same write that creates the link (one request, one sync version), not by a second call afterwards; an API test covers create with tagIds and projectIds, including an unknown or another user's id being refused"
  - "Pasting an address that is already saved on a tag's or project's page adds that tag or project to the existing link, and the duplicate notice still shows (e2e)"
  - "Undo of the paste removes the link as before; pasting on /, Unsorted and Archive behaves as before"
  - "The ladder climbs green at the branch's HEAD, first-load JS within 60 KB gzipped"
depends_on: [T-0015]
blocked_by: null
created: 2026-10-24
started: 2026-10-24
finished: 2026-10-24
labels:
  bonsai.branch: t0017-paste-into-view
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 1
---

# A link pasted on a tag's or a project's page joins that tag or project

## Context

Since T-0015, every list follows the store, so a link pasted on a tag's or project's page saved fine but its row left
at once, because it had no tag or project yet. On 2026-10-24 at 17:28 UTC the person said: "add it to the tag or
project automatically". `NewLinkInput` in `src/lib/store/types.ts` takes only url, title and via today.

## Scope

`NewLinkInput` and the store's `put` (with the optimistic row carrying the ids), the links create API in
`src/lib/server/api/links.ts` (accepting `tagIds` and `projectIds`, scoped to the user), `LinkList.svelte` (passing the
view's tag or project when it adds), and tests.

## Out of scope

The row layout and the status/priority controls (T-0016), and search (T-0009). The paste field on Archive stays as
it is.

## Notes

On a duplicate, adding the view's tag or project to the existing link is the orchestrator's reading of the person's
intent: they pasted it there to file it there.
