---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0020
title: Backups, the VPS deploy and CI — Litestream and restic services, deploy on the person's VPS, the ladder in CI
status: todo
lane: full
done_when: []
depends_on: [T-0005]
blocked_by: null
created: 2026-10-25
started: null
finished: null
labels:
  workflow.feature: F-web-mvp
  workflow.milestone: "MVP"
---

# Backups, the VPS deploy and CI

## Context

The rest of plan P-T-0002 step 3 under ADR-0004, after T-0005's Docker setup. It waits for the person's VPS facts
(STATE, Open questions). Its `done_when` is written once those facts are in.

## Scope

- Backups as compose services: Litestream to one S3-compatible bucket (provider-side encryption), a nightly
  `VACUUM INTO` snapshot backed up with restic (encrypted on the host) to a second bucket.
- The deploy on the person's VPS over HTTPS, with Resend's DNS (SPF, DKIM) checked, and `curl -I https://<host>`.
- A rehearsed restore from each backup into the volume, written in `deploy/RESTORE.md`, with a monthly reminder.
- Where the image is built (CI or the person's machine) and pulled; a GitHub Actions workflow running the ladder and
  `bonsai check` (base:ci).
- Carried: FTS5 is keyed on rowid, and `VACUUM INTO` may renumber rowids, so check the snapshot's FTS index; the
  drizzle-kit audit findings (dev only: check they stay out of the image); a LUKS volume if the person wants one.

## Out of scope

The app image and compose file themselves (T-0005), except what backups add to them.

## Notes
