---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0020
title: Backups and the deploy on the person's VPS — Litestream and restic services, the first deploy, a rehearsed restore
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

# Backups and the deploy on the person's VPS

## Context

The rest of plan P-T-0002 step 3 under ADR-0004, after T-0005's Docker setup. It waits for the person's VPS facts
(STATE, Open questions). Its `done_when` is written once those facts are in.

## Scope

- Backups as compose services: Litestream to one S3-compatible bucket (provider-side encryption), a nightly
  `VACUUM INTO` snapshot backed up with restic (encrypted on the host) to a second bucket.
- The deploy on the person's VPS over HTTPS, with Resend's DNS (SPF, DKIM) checked, and `curl -I https://<host>`.
- A rehearsed restore from each backup into the volume, written in `deploy/RESTORE.md`, with a monthly reminder.
- The first deploy through T-0029's deploy job (its secrets set for the VPS).
- Carried: FTS5 is keyed on rowid, and `VACUUM INTO` may renumber rowids, so check the snapshot's FTS index; the
  drizzle-kit audit findings (dev only: check they stay out of the image); a LUKS volume if the person wants one.

## Out of scope

The app image and compose file (T-0005), and CI/CD (T-0029), except what backups add to them.

## Notes

- From T-0005's security check (M-2026-10-25-d3972a53, non-blocking): console mail is not refused on a server, so
  the server's .env must not start from deploy/env.example as it is (Resend, LINKSINK_LISTEN empty, HTTP port 80);
  check the client address Caddy sees on the VPS (IPv6 included) for the rate limit; a .env without LINKSINK_LISTEN
  publishes on every address; pin both images by digest; Caddy runs as root in its container; the app image keeps
  npm and yarn.
- From builder@T-0005: open 80 and 443 on the VPS; an ACME contact email if wanted; build off the VPS (116 MB to
  pull); the backups mount the `data` volume.
