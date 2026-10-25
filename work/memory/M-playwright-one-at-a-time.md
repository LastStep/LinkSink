---
format: bonsai.memory/1   # fields: bonsai check --schema bonsai.memory; how to fill: skill base:memory
id: M-playwright-one-at-a-time
title: Playwright runs one at a time across all agents
kind: feedback
updated: 2026-10-25
source: "the person, 2026-10-25 09:08 UTC"
labels: {}
---

Only one Playwright or headless-browser run happens at a time on this machine, across every builder and verifier.
That includes `bonsai ladder`, whose e2e rung runs Playwright.

**Why:** the person said parallel browser runs "put a lot of load on the machine".

**How to apply:** every brief to a builder or verifier says to wrap each Playwright run, ladder climbs included, in
`flock <lock> <command>`, using a lock file in the session's scratchpad (`playwright.lock`). Unit tests, builds and
lint don't need the lock. Parallel agents are still fine; only their browser runs take turns.
