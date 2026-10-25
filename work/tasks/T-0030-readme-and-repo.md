---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0030
title: A README for the project, with how to host it, and the GitHub repository's description and topics
status: running
lane: light
done_when:
  - "README.md at the top says what LinkSink is, what works today and what does not yet, with screenshots; how to run it for development; how to run it with Docker on one machine and host it on a server or another Docker machine (pointing to deploy/README.md and deploy/SERVER.md); its settings; how to update; and where the plans live. Each command in it matches the files it names"
  - "The GitHub repository LastStep/LinkSink has a description and topics"
  - "The ladder climbs green at the branch's HEAD"
depends_on: []
blocked_by: null
created: 2026-10-25
started: 2026-10-25
finished: null
labels:
  bonsai.branch: t0030-readme
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: orchestrator
  workflow.feature: F-web-mvp
  workflow.milestone: "MVP"
---

# A README, with how to host it, and the repository's description and topics

## Context

The person, 2026-10-25 14:20 UTC: "meanwhile if its not being done by a subagent currently, then write up a proper
readme for the project, which should include how to host it. and also fill up other github related things, like
description, tags etc". Written by the orchestrator in this session (no builder had it). The detailed hosting steps
are T-0029's deploy/SERVER.md; the README gives the short form and points there, and is checked against it when
T-0029 lands.

## Scope

README.md, two screenshots under docs/, and the repository's description and topics on GitHub.

## Out of scope

.github/ (T-0029's), deploy/ (T-0005's and T-0029's), a licence (the person's choice).

## Notes
