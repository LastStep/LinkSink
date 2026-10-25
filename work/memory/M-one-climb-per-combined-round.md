---
format: bonsai.memory/1   # fields: bonsai check --schema bonsai.memory; how to fill: skill base:memory
id: M-one-climb-per-combined-round
title: One ladder climb per combined round, not one per task
kind: feedback
updated: 2026-10-25
source: "the person, 2026-10-25 16:25 UTC"
labels: {}
---

When several tasks land together on one combined branch, climb the ladder once at that branch's HEAD, not once per
task. That one green climb is the landing proof for every task in the round; each task's run report names it.

**Why:** the person asked, after waiting through seven identical climbs twice in one round (about 30 minutes each
time, since Playwright runs one at a time): "yes, climb once per combined round from now on".

**How to apply:** merge the round's branches into one combined branch, run one `bonsai ladder --task <one of them>`
at its HEAD (under the shared Playwright lock), and quote that result in each task's landing record. After a fix
round, climb once more at the new HEAD. Each builder still climbs its own branch before reporting done. For that same
round the person also asked for one verifier across all its tasks ("only run one verifier for all combined"); ask
before assuming that for a later round.
