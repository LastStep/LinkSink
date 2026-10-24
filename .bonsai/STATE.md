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

Planning is finished and approved; no code exists yet. LinkSink is a single-user, self-hosted link hub: paste or
share a link, it fills in title, source and media; the person adds tags, projects, status, priority, notes; archive;
full copy on every device with sync; web first, iOS later.

- One-pager `work/features/F-web-mvp.md`: approved 2026-10-24.
- Plan `work/plans/P-T-0002.md` (eleven build tasks, T-0003 to T-0013): approved 2026-10-24.
- Next task written and waiting: `work/tasks/T-0003-walking-skeleton.md` (todo). The person said to start the actual
  work in the next session.
- Look: direction A, Ledger; the mockup is in `design/reference/` (reference only, open `a.html`).
- Orchestrator's working notes, with every research finding and message id: `work/notes/orchestrator.md`.

## Next

1. Start T-0003 (walking skeleton) with a builder in its own worktree on branch `t0003-walking-skeleton`; brief it
   from plan step 1 and the task's `done_when`. Its first commit proves Better Auth on SvelteKit 3.1 end to end; if
   that fails, it stops blocked and the person picks the fallback (SvelteKit 2 or own auth).
2. After T-0003 lands: the person adds the ladder lines it hands over to `bonsai.yaml` (their edit), then T-0005
   (deploy), T-0006 (links + paste) and T-0007 (metadata fetcher) can run, at most two builders at once.
3. Chromium for browser tests and taste-skill checks: Playwright's copy is at `~/.cache/ms-playwright/chromium-1223`.

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
