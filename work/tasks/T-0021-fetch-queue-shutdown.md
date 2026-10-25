---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0021
title: The page-details fetch queue stops on shutdown, so the server exits cleanly mid-fetch
status: todo
lane: light
done_when:
  - "When the server is told to stop (SIGTERM, SvelteKit's `sveltekit:shutdown`), the fetch queue starts no new fetch and the process exits with code 0, within the shutdown timeout plus 2 s, while links are still waiting for their details (a test that starts the built server with waiting links and sends SIGTERM)"
  - "Links still waiting when it stopped stay waiting and are fetched at the next start (the existing kickFetches path, a test)"
  - "In Docker, `docker compose stop` right after a large import exits 0 within 10 s"
  - "The ladder climbs green at the branch's HEAD"
depends_on: [T-0005]
blocked_by: null
created: 2026-10-25
started: null
finished: null
labels:
  workflow.feature: F-web-mvp
  workflow.milestone: "MVP"
  workflow.estimate_h: 1
---

# The page-details fetch queue stops on shutdown

## Context

builder@T-0005 found (M-2026-10-25-26025368, run report R-2026-10-25-T-0005-docker): `docker compose stop` while
the queue in `src/lib/server/fetch/queue.ts` still has links to fetch ends in Docker's kill (exit 137, 3 of 3),
because the queue keeps node's event loop alive and nothing stops it on SIGTERM. No data is lost: SQLite's WAL keeps
every committed write, and `kickFetches` in `src/hooks.server.ts` fetches waiting links again at start.

## Scope

The fetch queue and the server's shutdown hook; their tests.

## Out of scope

The Docker files (T-0005), and the queue's pace and concurrency.

## Notes
