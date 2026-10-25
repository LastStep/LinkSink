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

README.md, two screenshots under docs/, .github/FUNDING.yml, and the repository's description and topics on GitHub.

## Out of scope

The workflows in .github/workflows/ (T-0029's), deploy/ (T-0005's and T-0029's), a licence (the person's choice).

## Notes

- The person, 14:22 UTC: "also in the readme make sure to add my https://buymeacoffee.com/trinetra link, if anyone
  wants to support. make sure to check online first to see how others do it, and then find the best way of doing
  this"; 14:23 UTC: "also be open about the app being built using AI (which in this instance is claude). put a red
  heart besides it". Done as: GitHub's own Sponsor button (.github/FUNDING.yml `buy_me_a_coffee: trinetra`, a key
  GitHub's docs list), a badge at the README's top and Buy Me a Coffee's own button in a Support section; a line
  under the intro and a "Built with Claude" section.
- f03b305 on t0030-readme. Description and 16 topics set on GitHub at 14:27 UTC. When T-0029 lands, check the
  README's hosting section against deploy/SERVER.md (the server settings example's name, the image setting, the
  deploy secrets) and add the CI badge.
- The person, 14:32 UTC: "use AGPL-3.0". LICENSE is GitHub's canonical AGPL-3.0 text (gh api licenses/agpl-3.0), with a
  badge and a Licence section in the README naming Rohan Yadav as the copyright holder (the commits' author); c88ccf6.
- The combined verifier (M-2026-10-25-6a8d2866) found the repository with 4 topics (bookmark-manager, self-hosted,
  sqlite, svelte) and the description without "fast search": the About section was changed at 15:23 UTC, after the
  16 topics were set at 14:27 (the gh output then listed all 16). Left as it is; the person is asked whether that
  was them. README fixes from that check: 7fd78c1.
- The person, 16:07 UTC: "yes the about section edit was me, leave it". Their description and 4 topics stand.
