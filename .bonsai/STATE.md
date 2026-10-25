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

The combined round landed on 2026-10-25 (e51a96e) and main is pushed to GitHub (github.com/LastStep/LinkSink,
public, AGPL-3.0). It brought CI/CD (T-0029: on every push the ladder, `bonsai check` and an image smoke test; on
main, publish to ghcr.io/laststep/linksink and an SSH deploy that skips until its secrets are set), the README
(T-0030), and five fixes from the person's first test in Docker: sidebar scroll (T-0022), rename a project from its
page (T-0027), the app icon (T-0028), details showing up live after an import (T-0023), a sort control with Status
and Last opened (T-0025). One verifier checked the whole round: FAIL on two doc errors, fixed, PASS
(M-2026-10-25-6aa15134). `bonsai ladder` for each of the seven at 8b74890: 645 unit, 80 e2e, first load on `/`
58.53 KB of 60.

The person's own Docker stack (compose project `linksink`, from the main checkout) is running on 127.0.0.1:443 and
:8080; agents never touch it. No task reads `running`.

**Built and waiting for the person's test** (each reads `verify`; light tasks read `done`):

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
| T-0029 | CI/CD on GitHub, GHCR, the SSH deploy, deploy/SERVER.md (another Docker machine) | e51a96e |

Done and landed: T-0015, T-0017, T-0022, T-0023, T-0025, T-0027, T-0028, T-0030.

**Things the person should check by hand:**
- the image is public on GHCR (they flip it once, in the package's settings), then `docker pull` works anywhere;
- importing the exported bookmarks file into Chrome or Firefox once;
- the redesign and the app icon on a real phone (Add to Home Screen).

**Limits now in the product:** one import holds at most 100,000 links and makes at most 1,000 new projects; an
upload is at most 20 MB.

**Rules:** Playwright runs one at a time across all agents (M-playwright-one-at-a-time; the lock is
`<scratchpad>/playwright.lock`, with flock; each agent its own scratch subfolder). One ladder climb per combined round
(M-one-climb-per-combined-round).

- **Notes:** work/notes/orchestrator.md holds every message id.
- **Run reports and verdicts:** work/runs/.

## Next

1. **The person tests,** then closes each `verify` task or files notes; triage them (workflow:brief).
2. **T-0026, the board view and the link map** (director lane): a discussion with the person first, then options.
3. **T-0024, several projects and tags per imported folder** (full lane): an amendment of P-T-0019 for the person.
4. **T-0021** (light): the fetch queue stops on SIGTERM, so `docker compose stop` mid-fetch exits 0.
5. **T-0020, backups and the VPS deploy** (todo): waits for the VPS facts (Open questions); the deploy itself is
   T-0029's job once its secrets are set.
6. **T-0010, sync and offline** (ADR-0001), then T-0011 (PWA and phone capture; reuse T-0028's icons, add 192 and
   512 px), then T-0013 (measure at scale): plan P-T-0002 steps 8, 9 and 11.
7. **Proposed follow-ups,** not yet tasks; the details are in the run reports.
   - From the combined round:
     - fetch details again for failed links (153 of the person's 342 failed on dead or refusing sites);
     - the details watch keeps polling after a failed check, reads only the newest 1,000 unarchived links, and
       needs a server count of waiting links (with T-0010);
     - `/favicon.ico` answers HTML;
     - the Projects page ignores an empty rename silently;
     - round4.spec.ts's 250 ms budget for a 1 MB CSV fails under load (359.8 ms once): a test-author task;
     - an arm64 image; Dependabot for the pins; a GitHub environment limiting the deploy to main (a setting the
       person makes);
     - SERVER.md step 6.2's "steps 1 to 3" reads like the list's own steps.
   - From T-0005: the trusted local root has no name constraints; its name carries its year (README follow-ups).
   - Import: cap raw tags per link; cap attribute names per tag; TOREAD flag → To read; Raindrop CSV; Pocket's
     ril_export.html; a "set every folder to…" control; fewer tab stops with many folders.
   - Export: stream it, or let it yield (a 500k-link account blocks for 7–9 s).
   - Search: retire toFtsQuery; pushState for filter history; an edited-sort index if T-0013 finds it slow.
   - Ladder: a WebKit project for the e2e rung (a ladder change, so a director-lane decision).
   - The budget is tight (58.53 of 60 KB): the next list-screen feature loads lazily.

## Open questions

- **Before T-0020 (backups and the VPS), from the person:**
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

- 2026-10-25 one ladder climb per combined round, not one per task (the person; M-one-climb-per-combined-round).
- 2026-10-25 the repository's About section (description, 4 topics) is the person's; leave it.
- 2026-10-25 LinkSink is licensed AGPL-3.0 (the person). The repository is public at github.com/LastStep/LinkSink.
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
