---
format: bonsai.run/1
id: R-2026-10-24-T-0014-resend-verification
task: T-0014
role: builder
model: sonnet
started: 2026-10-24 16:47
finished: 2026-10-24 17:10
outcome: merged
commits: []
labels: {}
---

# Run: resend the confirmation link on login

## What is different now

An unconfirmed account that logs in with the right password now gets a fresh confirmation mail, and the login page says
"We sent a new link to <email>". A wrong password sends nothing. The new link goes to the login page with the
"email is confirmed" note, and login then works.

## Deviations

- Two existing assertions in `e2e/skeleton.e2e.ts` changed, because the behaviour they described changed: the refused
  log-in now sends a second mail (outbox for the person: 1 -> 2 mails; whole outbox `['person@']` -> two `person@`).
  Nothing loosened: they are exact counts.
- The new e2e file (`e2e/resend-verification.e2e.ts`) removes its account and the outbox when done, since LinkSink is
  single-user and the other files sign up their own account.

## Evidence

- Better Auth 1.7.12 `sendOnSignIn` (node_modules/better-auth/dist/api/routes/sign-in.mjs:340): sends only after the
  password verified and the user is unverified, then still answers 403 EMAIL_NOT_VERIFIED (read).
- Ladder at HEAD dcc2ea0, clean tree: rungs 0-5 green; unit 102 seen, e2e 13 seen, 0 skipped, build/size green (ran).
- done_when 1: `resend-verification.e2e.ts` "an unconfirmed account gets a new link on a correct password, and nothing on a wrong one".
- done_when 2: "the new link confirms the account and login then works".
- done_when 3: "repeated log-in tries do not flood the inbox: the sign-in rate limit answers 429" (8 tries: 3 mails, 429 after).
  The limit is Better Auth's sign-in rule (3 per 10 s per client), so a patient caller still gets 18 mails a minute.
- done_when 4: ladder above.

## What did not work

Two first climbs failed: a type error (`resent` missing on one return) and the resend link from the API flood having no
callbackURL; fixed by passing `callbackURL: '/login?verified=1'` from the form. One climb failed with connection
refused (ECONNREFUSED on 4173): the orchestrator says another agent's pkill of the e2e server may have killed it; it was
not my code, and the rerun was green. (I had also started two climbs back to back by mistake.)

## Processes left running

none (checked with ss and ps; nothing on 4173).

## Left

Proposed task: a per-account cap on resend (e.g. one mail per minute) if 18 per minute is too many.

## Landing (orchestrator, 2026-10-24 11:30 UTC)

- Light lane: brief M-2026-10-24-e60ba01b, report M-2026-10-24-87654a14 (done). No verifier: the orchestrator read the
  whole diff against the task (auth-config sendOnSignIn, auth-form code, login page note, new e2e, two exact skeleton
  assertions updated for the second mail, not loosened). Outcome fixed from `done` to `merged` (bonsai check).
- The resend fires only after a correct password, so a mail flood needs the password; no per-account cap added.
- Merged as 843cf86; ladder climbed on main after this record.
