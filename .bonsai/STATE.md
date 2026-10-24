---
format: bonsai.state/1   # fields: bonsai check --schema bonsai.state; how to fill: skill base:state
updated: 2026-10-24
updated_by: orchestrator (opus)
labels:
  workflow.milestone: "MVP"
---

# Where this project stands

Rewritten whole whenever where the project stands changes; never appended to. A new session reads it first.

## Now

The walking skeleton (T-0003) is merged into main at 8d49111. It is a SvelteKit 3.1 app with Better Auth (works on kit
3, proved end to end), single-user sign-up, argon2id, SQLite WAL + FTS5 with the sync base (`syncWrite`), Ledger
tokens in `design/tokens.css`, and check/lint/unit/e2e/size tooling (36 KB gz first load). T-0003 is done; the ladder
(rungs 0–5, floor all six) is in `bonsai.yaml` and climbs green on main. Builder worktree `../LinkSink-t0003` still exists (branch merged; safe to remove).

- One-pager `work/features/F-web-mvp.md` and plan `work/plans/P-T-0002.md` (T-0003 to T-0013): approved.
- T-0003 run report with verdicts and the ladder lines: `work/runs/R-2026-10-24-T-0003-walking-skeleton.md`.
- Look: direction A, Ledger; reference in `design/reference/`.
- Orchestrator's working notes, with every message id: `work/notes/orchestrator.md`.

## Next

1. T-0006 (links API, paste, duplicates, undo) landed at 8ce031c and reads `verify` (the person closes it). T-0007
   (fetcher) is building; once it lands, rebased on T-0006 with `enqueueFetch` wired into POST /api/links, T-0008
   (organising + Ledger screens, approved) starts. QA now has WebKit (playwright webkit-2287) as well as Chromium.
2. T-0005 (deploy) waits for the person's VPS facts (Open questions); HTTPS only (Caddy redirect, HSTS, secure
   cookies), the person's word. T-0005 also carries: rate-limit client IP behind Caddy (Better Auth
   `advanced.ipAddress`; a direct caller can set x-forwarded-for), FTS5 rowid vs `VACUUM INTO`, building in CI with
   ORIGIN set (`kit.paths.origin` is build-time), drizzle-kit audit findings (moderate, dev only).
3. Chromium for browser tests: `~/.cache/ms-playwright/chromium-1223`. Geist font is named in the tokens but not
   served yet (system font for now).

## Open questions

- Before T-0005 (deploy), from the person: VPS provider, OS and RAM; a domain or subdomain pointing at it; SSH access;
  a Resend account; two S3-compatible buckets for backups; whether to put the database on a LUKS volume.
- The facts lens has not re-checked the plan's sync, fields and import passages added after its PASS
  (M-2026-10-24-488cd114); offer a re-check before T-0006/T-0010 if wanted.

## Decided lately

- 2026-10-24 ADR-0001: own small sync (full copy per device, global version, idempotent push, pull since cursor,
  tombstones 90 days). No sync engine, no Postgres.
- 2026-10-24 ADR-0002: SvelteKit 3 + Better Auth + SQLite (better-sqlite3, WAL, FTS5, Drizzle 0.45) on Node ≥ 22.19,
  Caddy + systemd on the person's VPS.
- 2026-10-24 ADR-0003: the look is direction A, Ledger.
- 2026-10-24 fields: Source and Media (one each, automatic, editable), Tags and Projects (many), Status and Priority
  (optional, fixed values), Archive; description auto-filled from the page, never overwritten once edited; import of
  bookmark files and Pocket CSV is in the MVP. Graph view is later, with its own one-pager.
- Protection: private and never lost (not end-to-end encrypted): HTTPS, login, two backups (one encrypted on the VPS
  with a password only the person holds), revocable devices.
