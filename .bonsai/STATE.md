---
format: bonsai.state/1   # fields: bonsai check --schema bonsai.state; how to fill: skill base:state
updated: 2026-10-25
updated_by: orchestrator (opus)
labels:
  workflow.milestone: "MVP"
---

# Where this project stands

Rewritten whole whenever where the project stands changes; never appended to. A new session reads it first.

## Now

T-0005, the Docker setup, landed on 2026-10-25 (304f5b6): the app image, and compose.yaml with Caddy serving HTTPS
only. The person asked to run it themselves on this machine first: `deploy/README.md` holds the steps
(https://localhost; http on 8080, since Apache in WSL holds port 80; the confirm link in `docker compose logs app`).
Main is green: `bonsai ladder` at 304f5b6 passed 624 unit and 67 e2e tests; the first load on `/` is 58.22 KB of
60. No task reads `running`. The worktree ../LinkSink-t0005 is kept until the person has run it. No process or
container of the agents' is running.

**Built and waiting for the person's test at the end** (they said "i will test everything in the end"; each reads
`verify`, or `done` for light tasks):

| Task | What | Merge |
|---|---|---|
| T-0007 | page details fetcher (titles, icons, previews, Source, Media, SSRF guard) | 5e9fc85 |
| T-0008 | organising and the Ledger screens | 258b400 |
| T-0018 | the redesign, ADR-0005: two-line rows, radio-list status/priority, details, frame, phone tab bar | 2274706 |
| T-0012 | export (bookmarks HTML, JSON) and import (bookmarks HTML, Pocket CSV) | 9fb1e0c |
| T-0019 | import preview with folder mapping | 153c7d5 |
| T-0009 | search as you type, filters, sort, keys, palette | c2bece2 |
| T-0016 | the director-lane options (OPT-0003 decided) | — |
| T-0005 | the Docker setup: app image, compose with Caddy (HTTPS only), run here at https://localhost | 304f5b6 |

Already done: T-0015 (BUG-001, BUG-002) and T-0017 (a paste on a tag or project page joins it).

**Things the person should check by hand:**
- importing the exported bookmarks file into Chrome or Firefox once;
- a real bookmarks export through the import preview;
- the redesign on a real phone.

**Limits now in the product:** one import holds at most 100,000 links and makes at most 1,000 new projects; an
upload is at most 20 MB.

**A 100,000-link import on the combined code** (runner M-2026-10-25-90524a3f): 200 in 45 s, 330 of 330 health checks
answered, memory peaking at 525 MB and steady at 233 MB.

**Rule:** Playwright runs one at a time across all agents (memory note M-playwright-one-at-a-time). The shared lock
is `<scratchpad>/playwright.lock`, used with flock. Each agent works in its own scratch subfolder.

- **Notes:** work/notes/orchestrator.md holds every message id.
- **Run reports and verdicts:** work/runs/.
- **Comparison page:** https://claude.ai/artifact/5EHQa6dDUeoLn1jbyTLwf3.

## Next

1. **The person tests everything,** then closes each `verify` task or files notes. Triage the notes into bugs and
   tasks (workflow:brief). Their first round (2026-10-25, in Docker, after importing 342 Firefox bookmarks) is
   triaged, all `todo`, none started:
   - light: T-0022 sidebar scroll (BUG-003), T-0023 details after an import show live (BUG-004), T-0025 a sort
     control with status and priority, T-0027 rename a project from its page, T-0028 the app icon (BUG-005);
   - full: T-0024 several projects and tags per imported folder (amends P-T-0019);
   - director: T-0026 the board view and the link map, to be discussed with the person first.
2. **T-0020, backups, the VPS deploy and CI** (todo). It waits for the person's VPS facts (Open questions). It
   carries: Litestream and restic as compose services; FTS5 keyed on rowid vs `VACUUM INTO`; building in CI and the
   ladder there; the drizzle-kit audit (dev only, not in the image); a server's .env (Resend, LINKSINK_LISTEN empty,
   port 80), never deploy/env.example as it is; the client address Caddy sees on the VPS; images pinned by digest.
   Its Notes list them all. Also **T-0021** (light, todo): the fetch queue stops on SIGTERM, so `docker compose stop`
   mid-fetch exits 0 (today Docker kills it after 10 s; nothing is lost). And two small README follow-ups in T-0005's
   run report (the trusted local root has no name constraints; the root's name carries its year).
3. **T-0010, sync and offline** (ADR-0001), then T-0011 (PWA and phone capture), then T-0013 (measure at scale).
   These are steps 8, 9 and 11 of the approved plan P-T-0002.
4. **Proposed follow-ups,** not yet tasks; the details are in the run reports.
   - Import:
     - cap the raw tags per link;
     - cap attribute names per tag;
     - TOREAD flag → To read;
     - Raindrop CSV;
     - Pocket's ril_export.html;
     - a "set every folder to…" control;
     - fewer tab stops with many folders.
   - Export: stream it, or let it yield (a 500k-link account blocks for 7–9 s).
   - Search:
     - retire toFtsQuery;
     - pushState for filter history;
     - an edited-sort index if T-0013 finds it slow.
   - Ladder: a WebKit project for the e2e rung (a ladder change, so a director-lane decision).
   - The budget is tight (58 of 60 KB): the next list-screen feature loads lazily.

## Open questions

- **Before T-0020 (deploy), from the person:**
  - the VPS provider, OS and RAM;
  - a domain or subdomain pointing at it;
  - SSH access;
  - a Resend account;
  - two S3-compatible buckets for backups;
  - whether to put the database on a LUKS volume.
- **Raindrop's own "Unsorted" collection** defaults to No project on import, in Raindrop files only. That was the
  orchestrator's default (2026-10-25); the person confirms it when they test.
- **The facts lens** has not re-checked the plan's sync, fields and import passages added after its PASS
  (M-2026-10-24-488cd114). Offer a re-check before T-0010.

## Decided lately

- 2026-10-25 T-0005 settles ADR-0004's open question: the origin is set at run time. The image carries none
  (adapter-node derives https://<Host> behind Caddy), so one image serves any host. Backups, the VPS and CI are
  T-0020 (the person: run it here first).
- 2026-10-25 ADR-0005: rows are two lines with a fixed status/priority cell (f3), status and priority are radio lists
  (c3), and the Fable redesign of the details, frame and phone is taken whole. It amends ADR-0003.
- 2026-10-25 import gets a preview with per-folder mapping (the person: "a screen which allows for mapping and
  choosing"; T-0019).
- 2026-10-25 a link pasted on a tag's or project's page joins it (the person; T-0017).
- 2026-10-25 Playwright runs one at a time (the person).
- 2026-10-24 ADR-0004: deploy as Docker Compose (app, Caddy, backups) so it runs on any host; replaces systemd.
- 2026-10-24 ADR-0003: the look is direction A, Ledger.
- 2026-10-24 ADR-0002: SvelteKit 3 + Better Auth + SQLite (better-sqlite3, WAL, FTS5, Drizzle 0.45) on Node ≥ 22.19.
- 2026-10-24 ADR-0001: own small sync (a full copy per device, a global version, idempotent push, pull since a
  cursor, tombstones kept 90 days).
- 2026-10-24 fields:
  - Source and Media: one each, set automatically, editable;
  - Tags and Projects: many per link;
  - Status and Priority: optional, fixed values;
  - Archive;
  - the description is filled from the page and never overwritten once edited;
  - importing bookmark files and Pocket CSV is in the MVP.
- Protection: private and never lost, not end-to-end encrypted. HTTPS, login, two backups (one encrypted on the VPS
  with a password only the person holds), and devices that can be revoked.
