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

The session wrapped up cleanly on 2026-10-25 at the person's word. Main is green: `bonsai ladder` at c2bece2 passed
624 unit and 67 e2e tests, and the first load on `/` is 58.22 KB of 60. No task reads `running`, no worktree is left
(all merged branches remain), and no process is running.

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
   tasks (workflow:brief).
2. **T-0005, deploy** (Docker Compose, ADR-0004). It waits for the person's VPS facts (Open questions). The parts
   that need no VPS (Dockerfile, compose, Caddy, backups, CI) can be built once Docker works in WSL: the person turns
   on Docker Desktop → Settings → Resources → WSL Integration. T-0005 carries:
   - BODY_SIZE_LIMIT=Infinity (the hooks hold every route at 512 KB, and the import reads at most 20 MB);
   - ORIGIN at build time (a build without it breaks /api/auth: the runner hit this);
   - the rate-limit client IP behind Caddy (Better Auth `advanced.ipAddress`);
   - FTS5 keyed on rowid vs `VACUUM INTO`;
   - building in CI;
   - the drizzle-kit audit findings;
   - HTTPS only.
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

- **Before T-0005 (deploy), from the person:**
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
