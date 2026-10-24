---
id: ADR-0004   # a decision record; every field and how to fill it: skill workflow:decision
title: LinkSink deploys as a Docker Compose setup, so it runs on any host
status: accepted
date: 2026-10-24
scope: technical
decided_by: person
superseded_by: null
---

# ADR-0004: LinkSink deploys as a Docker Compose setup, so it runs on any host

## Context

ADR-0002 and plan P-T-0002 step 3 chose systemd units behind Caddy on the person's VPS, and listed Docker Compose as
the alternative that lost ("fewest moving parts on one VPS"). Before T-0005 was written, the person said (2026-10-24
11:20 UTC): "for deployment i want a docker setup. so i can easily just deploy it anywhere".

## Options

- **A. Docker Compose** (chosen): an image for the app, Caddy for HTTPS, backups as their own services; one
  `docker compose up -d` on any host with Docker.
- **B. systemd + Caddy on the host** (ADR-0002's original): fewer layers, but tied to one machine's setup.

## Decision

T-0005 delivers a Docker setup: a multi-stage `Dockerfile` for the app (Node 22, adapter-node, the native modules
better-sqlite3 and sharp built for the image's platform, running as a non-root user), and a `compose.yaml` with the
app, Caddy (HTTPS only: redirect from http, HSTS, the person's word 10:26) and the backups (Litestream to one bucket, a
nightly encrypted restic snapshot to a second), the database and media on a named volume, settings from an `.env` file
beside it. The rest of ADR-0002 (SvelteKit 3, Better Auth, SQLite, Caddy) stands.

## Consequences

- systemd units are dropped from the plan; the restore rehearsal (deploy/RESTORE.md) restores into the volume.
- Open for T-0005: the public origin is fixed at build time today (`kit.paths.origin`; SvelteKit 3 removed
  adapter-node's ORIGIN variable). An image that runs "anywhere" needs the origin at run time, or an image built per
  host (build argument). T-0005's plan settles which, with evidence, before building.
- Images are built off the small VPS (CI or the person's machine) and pulled, or built on the host if it has the
  memory; T-0005 says which.
- Rate limiting behind Caddy must read the client address Caddy forwards (carried from T-0003's security review).
