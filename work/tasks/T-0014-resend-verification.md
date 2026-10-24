---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0014
title: Resend the confirmation link when an unconfirmed account tries to log in
status: running
lane: light
done_when:
  - "Logging in with the right password on an unconfirmed account sends a fresh confirmation mail (Better Auth emailVerification.sendOnSignIn) and the login page says a new link was sent; a wrong password sends nothing (e2e with the console outbox)"
  - "Following that new link confirms the account and login then works (e2e)"
  - "The resend is rate-limited like other auth calls (no mail flood from repeated login attempts)"
  - "The ladder climbs green at the branch's HEAD"
depends_on: [T-0003]
blocked_by: null
created: 2026-10-24
started: 2026-10-24
finished: null
labels:
  bonsai.branch: t0014-resend-verification
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 1
---

# Resend the confirmation link on login

## Context

The person signed up in dev, missed the console mail, and was locked out: the one account existed unconfirmed, so
sign-up was closed and login refused, with nothing to send the link again (2026-10-24). On the VPS a lost mail would do
the same. Auth setup: `src/lib/server/auth-config.ts`, forms through `src/lib/server/auth-form.ts`.

## Scope

The Better Auth option, the login page message, the e2e.

## Out of scope

A separate "resend" button or page; password reset changes.

## Notes
