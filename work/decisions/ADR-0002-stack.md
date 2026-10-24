---
id: ADR-0002   # a decision record; every field and how to fill it: skill workflow:decision
title: LinkSink is built on SvelteKit 3 with Better Auth and SQLite, run by systemd behind Caddy on the person's VPS
status: accepted
date: 2026-10-24
scope: product
decided_by: person
superseded_by: null
---

# ADR-0002: LinkSink is built on SvelteKit 3 with Better Auth and SQLite, run by systemd behind Caddy on the person's VPS

## Context

A single-user link hub that must feel instant and light on phones, self-hosted on one VPS, with email sign-up and a
native iOS app later. Options write-up: `work/options/OPT-0001-stack.md`; research: messages M-2026-10-24-3d020f86,
M-2026-10-24-71dcc595; the person also tried a Svelte motion spike (M-2026-10-24-f816f00b: 43.7 KB gzipped JS with
Svelte's built-in motion, no animation library).

## Options

- **A. SvelteKit + Better Auth** (chosen): most app-like for the least JS; a maintained auth library with a bearer
  plugin for iOS.
- **B. SvelteKit + own auth:** no auth dependency, a few hundred lines of security code to own.
- **C. Hono + htmx:** lightest pages, app-like motion and offline built by hand.

## Decision

SvelteKit 3 (Svelte 5, TypeScript ~6, adapter-node on Node ≥ 22.19) for the web app and its API; Better Auth 1.7.x
(email + password, verification, reset, argon2id, bearer tokens) for accounts; SQLite via better-sqlite3 in WAL mode
with FTS5, through Drizzle 0.45 (pinned); Caddy for HTTPS and systemd for the processes on the person's VPS; sync per
ADR-0001.

## Consequences

- No React, Next.js or Postgres; do not add a UI kit or animation library while Svelte's built-ins and CSS do the job
  (the 60 KB first-load budget holds the line).
- Better Auth is young and fast-moving: pin it, watch its advisories, use no plugin we do not need (no magic link).
- If the T-0003 spike shows Better Auth failing on SvelteKit 3, fall back to SvelteKit 2 or option B's auth; that
  changes this record, so it is superseded, not edited.
