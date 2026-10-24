---
id: OPT-0001   # an options write-up; every field and how to fill it: skill workflow:options
title: What should LinkSink be built on, and how should it run on the VPS?
lane: director
status: decided
author: orchestrator
created: 2026-10-24
decided: 2026-10-24
chosen: A
---

# What should LinkSink be built on, and how should it run on the VPS?

## Why this is being asked now

Nothing can be built until the stack is chosen: the first build task (a thin working skeleton, deployed) depends on
it. It would cost about a week to change once real features sit on top. Written by the orchestrator from three
researchers' reports (messages M-2026-10-24-3d020f86, M-2026-10-24-33b09aa7, M-2026-10-24-71dcc595).

Already settled by you, so not options here: single user for now, your own VPS, basic email sign-up, no Supabase.

## What matters here

1. **Feels instant and light on a phone**: little JavaScript to download, app-like navigation, works on a weak
   connection.
2. **Small and simple to run on one VPS**: few processes, little RAM, easy backups, easy to fix when alone.
3. **Ready for the iOS app later**: the same backend serves a native app (and an iOS Shortcut) with tokens.

## Options

What every option shares (none of the three changes this):
- **SQLite** as the database, one file on the VPS, with its built-in full-text search (FTS5). For one person it is
  faster and simpler than Postgres, which would be a second always-running service for no gain. Measured: search
  across 100,000 links answers in about a millisecond.
- **Caddy** in front (automatic HTTPS), the app run by **systemd**, backups by **Litestream** (continuous copy to
  cheap object storage) plus a nightly snapshot.
- **Resend** to send the sign-up and password-reset emails (free: 100 a day).

### A. SvelteKit + Better Auth (recommended)

SvelteKit is a web framework that compiles most of itself away, so the phone downloads little, and it gives
app-like page changes, forms that work even before scripts load, and a built-in hook for offline support. Better
Auth is the library most new projects now use for sign-up, login, email verification and password reset (the older
choices, Lucia and Auth.js, have stepped back in its favour), and it has a token mode for the iOS app.

- **Gets us:** the most app-like feel for the least weight; sign-up, verification, reset and iOS tokens without
  writing them ourselves; one Node process on the server.
- **Costs:** SvelteKit 3.0 is three weeks old. Better Auth declares support for it (its current release accepts
  SvelteKit 2 or 3, and its docs use SvelteKit 3 code), but we have not run the two together yet. The first build task
  does exactly that before anything else; if it fails, we fall back to SvelteKit 2 or to option B's auth, at a cost of
  about half a day. Better Auth moves fast and had a serious bug in its magic-link feature last month
  (we would not use that feature), so updates need watching.
- **Reversible?** Swapping the auth library later: one to two days. Swapping the framework: about a week, since the
  screens would be rewritten; the database and server logic survive.

### B. SvelteKit + our own small auth

The same framework, but sign-up, login, sessions, verification, reset and iOS tokens written by us, following the
Copenhagen Book (the standard guide from the author of Lucia), with passwords hashed by argon2id.

- **Gets us:** no auth dependency to watch or update; every line understood; a little lighter.
- **Costs:** a few hundred lines we must keep correct forever: sessions, rate limiting, reset tokens, email
  verification, token auth for iOS. About one to two extra days, and security mistakes are ours.
- **Reversible?** Moving to a library later: one to two days.

### C. Hono + server-rendered pages (htmx)

A tiny server that sends finished HTML pages, with a small script (htmx) to swap parts of the page. The phone
downloads almost no JavaScript.

- **Gets us:** the lightest possible pages and server.
- **Costs:** app-like touches (instant optimistic saves, offline list, a command palette, smooth transitions) are
  built by hand and fight the approach, which works against "great UI/UX". Auth, routing and CSRF are assembled
  ourselves. Hono's next major version is still a release candidate.
- **Reversible?** Moving to an app framework later means rewriting every screen: about a week.

Not offered: Next.js (several times the JavaScript per page, heavier on a small VPS) and Astro (built for content
sites, but nearly all of LinkSink is interactive).

## Comparison

| | A. SvelteKit + Better Auth | B. SvelteKit + own auth | C. Hono + htmx |
|---|---|---|---|
| Feels instant and app-like | Best | Best | Fast pages, less app-like |
| JavaScript on the phone | Small (~60 KB target) | Small | Smallest |
| Simple to run on the VPS | One process | One process | One process |
| Ready for iOS app | Token plugin built in | We write tokens | We write tokens |
| Time to working skeleton | ~1 session | ~1.5 sessions | ~1.5 sessions |
| New-tech risk | SvelteKit 3 is new; Better Auth declares support (tested first) | SvelteKit 3 only | Hono 5 is RC |
| Cost | Free | Free | Free |
| Reversibility | Auth: 1–2 days; framework: ~1 week | Auth: 1–2 days | ~1 week |

## Recommendation

**A. SvelteKit + Better Auth.** It gives the most app-like feel for very little weight, and leaves the auth code
(the part where mistakes are most costly) to a maintained library. What would change this: if the first build task
shows Better Auth does not work on SvelteKit 3, or you would rather own every line of auth, take B; it keeps
everything else in this plan unchanged.

## What happens next, either way

- **A or B:** T-0003, the walking skeleton: a SvelteKit 3 app with sign-up and login, one table, search working, the
  project's automated checks, deployed to your VPS behind Caddy. Plan: `work/plans/P-T-0002.md`.
- **C:** the plan is rewritten for server-rendered pages before anything is built.

## Sources

From researcher reports M-2026-10-24-3d020f86 and M-2026-10-24-71dcc595 (24 Oct 2026); quotes as read there.
- SvelteKit 3.0.0 (1 Oct 2026): "requires Node 22 or newer", "TypeScript 6 is now the minimum".
  https://github.com/sveltejs/kit/releases
- SvelteKit forms: "When using <form>, client-side JavaScript is optional". https://svelte.dev/docs/kit/form-actions
- Lucia: "Lucia was deprecated in March 2025." https://lucia-auth.com/
- Auth.js: "we strongly recommend new projects to start with Better Auth."
  https://www.better-auth.com/blog/authjs-joins-better-auth
- Better Auth SvelteKit integration: "The examples use SvelteKit 3 imports."; better-auth@1.7.12 peer range
  `@sveltejs/kit ^2.0.0 || ^3.0.0` (verifier, M-2026-10-24-b9067987). https://www.better-auth.com/docs/integrations/svelte-kit
- Better Auth Bearer plugin: "enables authentication using Bearer tokens as an alternative to browser cookies."
  https://www.better-auth.com/docs/plugins/bearer
- Better Auth v1.7.7 (30 Sep 2026): "Fixed a critical Magic Link account-takeover vulnerability".
  https://github.com/better-auth/better-auth/releases
- Copenhagen Book: "Argon2id should be your first choice". https://copenhagen.pilcrowonpaper.com/password-authentication
- SQLite WAL: "readers do not block writers and a writer does not block readers". https://sqlite.org/wal.html
- FTS5 latency at 100k rows: p95 0.23 ms (word), 2.1 ms (trigram prefix); the researcher's own synthetic benchmark.
- Litestream "continuously streams SQLite changes to external storage". https://litestream.io/
- Resend free plan: "limited to 100 emails per day". https://resend.com/pricing
- Hono: hono/tiny "under 14kB"; v5.0.0-rc.1 is a pre-release. https://hono.dev/docs/ ,
  https://github.com/honojs/hono/releases
- Bundle sizes: no primary measurement found; the ~60 KB target is inference, to be measured on the skeleton.
