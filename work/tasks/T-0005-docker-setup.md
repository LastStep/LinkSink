---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0005
title: Docker setup — an app image and a compose file with Caddy (HTTPS only), runnable on this machine at https://localhost
status: approved
lane: full
done_when:
  - "From a clean checkout with no .env and no ORIGIN in the environment, `docker compose build` builds the app image from a multi-stage Dockerfile on a pinned Node 22 slim (glibc) base; the final stage holds the built server, production node_modules only (no drizzle-kit, vite or playwright in it), package.json and drizzle/, and runs as a non-root user (`docker compose run --rm app id -u` is not 0)"
  - "compose.yaml runs two services, app and caddy; only caddy publishes ports (80 and 443); the app's port is reachable only on the compose network; every setting comes from a .env beside compose.yaml, and a committed example file lists each one with a comment"
  - "The public origin is set once (the host name), and compose derives the app's ORIGIN from it; the image carries no origin of its own, so the same image serves any host name: shown by one image serving both https://localhost and a second host name on this machine without a rebuild"
  - "With the host set to localhost and MAIL_TRANSPORT=console, `docker compose up -d` serves https://localhost: `curl -k -I https://localhost/login` answers 200, `curl -I http://localhost/login` answers a redirect to https, and a scripted run against the containers signs up, confirms through the link printed in `docker compose logs app`, signs in, saves a public link and sees its title fetched"
  - "HTTPS only: for a host other than localhost the Caddy config sends Strict-Transport-Security and redirects http to https (shown by `caddy adapt` output for a sample host); for localhost it sends no HSTS header; Better Auth's session cookie set on sign-in through Caddy carries Secure"
  - "The database and the media cache live on a named volume at /data: after `docker compose down` then `docker compose up -d`, the account and the saved link are still there"
  - "Behind Caddy the sign-in rate limit keys on the client: the app's log has no 'Rate limiting could not determine a client IP' warning, and a fourth sign-in try within 10 s from one client answers 429"
  - "An import file bigger than 512 KB and under 20 MB is accepted through https://localhost; one over 20 MB answers the app's own 413 message"
  - "`docker compose stop` stops the app within 10 s with exit code 0 (SIGTERM reaches node)"
  - "deploy/README.md tells the person how to run it on this machine in order: the .env to write, the commands, where the confirm link appears, the browser's certificate warning (and how to trust Caddy's local root on Windows, optional), how to stop, and how to wipe the data"
  - "The ladder climbs green at the branch's HEAD"
depends_on: [T-0003]
blocked_by: null
created: 2026-10-25
started: null
finished: null
labels:
  bonsai.branch: t0005-docker
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.model: opus
  workflow.feature: F-web-mvp
  workflow.milestone: "MVP"
  workflow.estimate_h: 4
---

# Docker setup — an app image and a compose file with Caddy, runnable here

## Context

Plan `work/plans/P-T-0002.md` Approach step 3, as amended by `work/decisions/ADR-0004-docker-deploy.md` (Docker
Compose replaces systemd). The person asked on 2026-10-25 10:41 UTC: "can you do the docker setup for this app, and
then i want to run it myself and test it on this machine first". This task is the part that needs no VPS; backups,
the VPS deploy and CI are T-0020.

ADR-0004 left one question to this task: the origin at build time or at run time. Settled at run time, with
evidence: `node_modules/@sveltejs/adapter-node/src/handler.js` uses the build's `paths.origin` only when it is set,
and otherwise derives `https://<Host>` from each request (protocol from `PROTOCOL_HEADER`, else `https`). Caddy's
reverse_proxy keeps the client's Host header, so an image built without ORIGIN gets the right origin behind Caddy.
The runner's "a build without ORIGIN breaks /api/auth" (M-2026-10-25-90524a3f) was plain http straight to node,
which that same default reads as https; behind Caddy, which serves HTTPS only, it does not arise.

The rate-limit client IP (carried from T-0003's security review): Better Auth reads `x-forwarded-for` by default and
trusts it only when it holds one address (`node_modules/@better-auth/core/dist/utils/ip.mjs`, `getIPFromHeader`).
Caddy with no `trusted_proxies` replaces any incoming X-Forwarded-For with the client's own address, so no app code
change is expected, as long as the app's port is published nowhere.

## Scope

- `Dockerfile` and `.dockerignore` at the top (the build reads `design/tokens.css`; never `.env`, `data/`, `.git`).
- `compose.yaml` at the top: `app` and `caddy`, a named volume for /data, Caddy's own data volume.
- `deploy/Caddyfile`, the example settings file, and `deploy/README.md` (running it on this machine).
- In the image: `DATABASE_PATH=/data/linksink.db` (media lands in /data/media beside it), `BODY_SIZE_LIMIT=Infinity`,
  `NODE_ENV=production`, the working folder holding `drizzle/` (migrations run from `resolve('drizzle')` at start).

## Out of scope

- Backups (Litestream, restic, `VACUUM INTO` and the FTS rowid question), the VPS deploy, a deploy script, CI,
  Resend's DNS and the restore rehearsal: T-0020.
- Any change to the app's own code or behaviour. If one turns out to be needed, stop and report it first.

## Notes

- Approved on the person's word above (P-T-0002 step 3 was approved; ADR-0004 was the person's), as T-0012 was.
- Local mail: `MAIL_TRANSPORT=console` prints the confirm link to the app's log (src/lib/server/config.ts). A real
  deploy uses Resend (T-0020).
