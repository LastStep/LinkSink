---
format: bonsai.memory/1   # fields: bonsai check --schema bonsai.memory; how to fill: skill base:memory
id: M-compose-project-is-the-persons
title: The compose project "linksink" is the person's own stack; agents never run compose without their own -p
kind: project
updated: 2026-10-25
source: "the orchestrator, 2026-10-25 16:45 UTC, from the person's stack stopping at 14:18 UTC"
labels: {}
---

compose.yaml sets `name: linksink`, which is the project of the person's own Docker stack on this machine (run from
the main checkout). Any `docker compose` command in any checkout of this repository, worktrees and copied folders
included, targets that stack unless it is given a project of its own.

**Why:** on 2026-10-25 the person's running stack was stopped at 14:18:42 UTC (Caddy, then the app, exit 0: a
`docker compose stop`), while builder@T-0029 was testing deploy/update.sh and the data move with compose against
copies of compose.yaml. Its brief said to use its own project names; the stop came anyway. Nothing was lost.

**How to apply:** every brief that may run Docker says: pass `-p <your own project>` (or set COMPOSE_PROJECT_NAME)
on every `docker compose` call, including inside scripts such as deploy/update.sh run on this machine; check
`docker compose ls` before and after, and report if the `linksink` project changed. Never stop, start or recreate
the `linksink` project unless the person asks.
