---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0003
title: Walking skeleton — SvelteKit 3 app with Better Auth sign-up, sync-ready SQLite, Ledger design tokens and the checks
status: todo
lane: full
done_when:
  - "A first commit proves sign-up, email verification (console mailer), login, inserting a link and an FTS5 query on SvelteKit 3.1 with Better Auth 1.7.x; if Better Auth fails on SvelteKit 3, the task is blocked with the full error instead"
  - "A second sign-up is refused once one user exists"
  - "Passwords are hashed with argon2id (19 MiB, t=2, p=1), and Better Auth's session cookie cache is off"
  - "The database opens in WAL mode with foreign keys on, from Drizzle migrations in drizzle/, and the links table carries version and deleted_at"
  - "syncWrite bumps the global version once per write and stamps every row it changes; a soft delete keeps the row with deleted_at set (unit tests)"
  - "design/tokens.css holds direction A's tokens, light and dark, and design/reference/ holds the A mockup with a README saying it is reference only"
  - "npm run check, npm run lint, npm run test:unit and npm run test:e2e pass, and npm run size reports the first-load JS under 60 KB gzipped"
  - "The exact ladder lines for bonsai.yaml are written in the run report for the person to add"
depends_on: [T-0001]
blocked_by: null
created: 2026-10-24
started: null
finished: null
labels:
  bonsai.branch: t0003-walking-skeleton
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 4
---

# Walking skeleton — SvelteKit 3 app with Better Auth sign-up, sync-ready SQLite, Ledger design tokens and the checks

## Context

The plan's step 1 (`work/plans/P-T-0002.md`, approved 2026-10-24) says exactly what this builds; the stack is
ADR-0002, sync ADR-0001 (sync columns and `syncWrite` from the first migration), the look ADR-0003. The Ledger mockup
is in the orchestrator's scratch folder (T-0004 report M-2026-10-24-2f8b5d98); the orchestrator copies it into the
brief's pointers when this task starts.

## Scope

Project scaffold, the database layer and first migrations, Better Auth email + password, the mailer interface, the
sync write helper, one links table and page, design tokens and reference, the test and size tooling, the ladder lines.

## Out of scope

Deploying (T-0005), paste-to-save and the links API (T-0006), metadata fetching (T-0007), any screen beyond a plain
sign-up, login and links list. Editing `bonsai.yaml`: the ladder is the person's edit.

## Notes
