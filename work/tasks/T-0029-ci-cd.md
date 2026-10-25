---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0029
title: CI/CD on GitHub — the ladder and bonsai check on every push, the image published to GHCR, a deploy over SSH, and steps for running LinkSink on another Docker machine
status: verify
lane: full
done_when:
  - "On every push and pull request, GitHub Actions runs the ladder's rungs 1 to 5 (types, lint, unit, e2e in Chromium, build and size) and `bonsai check` (base:ci); any failure fails the run. Shown by a green run on the task's branch, and a red run on a throwaway branch with one unit test broken (that branch deleted afterwards)"
  - "CI builds the app image on every run; it starts that image with compose (localhost, console mail) and checks that https://localhost/login answers 200 and that plain http redirects, before anything is published"
  - "Only on main and on v* tags, and only after the jobs above pass, the image is published to ghcr.io/laststep/linksink, tagged latest and sha-<short> (and the version on a tag), with OCI labels naming the repository. A pull request, a fork's included, never publishes and never sees a secret; no workflow uses pull_request_target; every action is pinned by its full commit"
  - "compose.yaml names the published image (a setting can name another), so a folder holding only compose.yaml, deploy/Caddyfile and a .env runs LinkSink with `docker compose pull` and `docker compose up -d`, with no source and no build; this machine still builds with `docker compose up -d --build`"
  - "A deploy job runs after a publish on main, and on demand for a chosen tag: when the repository's deploy secrets are set (host, user, SSH key, folder), it connects over SSH, pulls, restarts and checks that https://<host>/login answers 200; with no secrets it skips with a notice and the run stays green. The commands it runs on the host are one script in deploy/, proven on this machine against a stack of its own"
  - "HSTS is sent only for host names that get a public certificate: none for localhost, *.localhost, *.local, *.internal, *.home.arpa or an IP address, so a browser lets the person past the local certificate's warning (shown by `caddy adapt` and live)"
  - "deploy/SERVER.md gives the steps for running LinkSink on another Docker machine, in order, for two cases: a server with a domain (public certificate, Resend mail, every address, port 80), and another machine on the home network with no domain (Caddy's local certificate). It covers the settings, pulling the image, moving the data from this machine, updating, and setting up the deploy secrets. A committed server settings example never sets console mail"
  - "Moving the data, as SERVER.md says, works: run here from one compose project's volume into a fresh one, the account signs in and the link count is the same"
  - "The ladder climbs green at the branch's HEAD"
depends_on: [T-0005]
blocked_by: null
created: 2026-10-25
started: 2026-10-25
finished: null
labels:
  bonsai.branch: t0029-ci-cd
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.model: opus
  workflow.feature: F-web-mvp
  workflow.milestone: "MVP"
  workflow.estimate_h: 5
---

# CI/CD on GitHub, and running LinkSink on another Docker machine

## Context

The person, 2026-10-25 13:43 UTC: "now i have made the git repo https://github.com/LastStep/LinkSink.git , so put
the project here if its not. and then give me proper steps on how i can run this app on a different docker machine.
make sure the ci/cd is fully done". main was pushed there (public) the same minute. Plan P-T-0002 step 3 asked for a
GitHub Actions workflow running the ladder and `bonsai check`; ADR-0004 says images are built off the small VPS (CI)
and pulled. T-0005 built the image and compose.yaml. T-0020 keeps backups and the deploy on the person's own VPS,
which still waits for its facts.

## Scope

- `.github/workflows/`: CI (the ladder, bonsai check, the image and its smoke test), publish to GHCR, deploy.
- compose.yaml (the image's name), deploy/Caddyfile (HSTS only for public names), a deploy script, a server
  settings example, deploy/SERVER.md, and a pointer to it from deploy/README.md.

## Out of scope

- The app's own code. If CI cannot run the ladder without a change to it, stop and report first.
- Backups and the person's VPS (T-0020).

## Notes

- Approved on the person's word above, as T-0005 was.
- The security check of T-0005 (M-2026-10-25-d3972a53) carried: console mail is not refused on a server; pin images
  by digest; check the client address Caddy sees on a server.
