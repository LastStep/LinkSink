---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0001
title: Choose LinkSink's stack, data store, auth approach and VPS deployment
status: done
lane: director
done_when:
  - "work/options/OPT-0001-stack.md exists with two to four options, their trade-offs, the cost to reverse each, and one recommendation"
  - "The person has chosen an option and the choice is recorded as a decision in work/decisions"
depends_on: []
blocked_by: null
created: 2026-10-24
started: 2026-10-24
finished: 2026-10-24
labels:
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
---

# Choose LinkSink's stack, data store, auth approach and VPS deployment

## Context

LinkSink is a personal link hub: paste a link, it is saved with its title and preview, tagged by groups (category,
source, project, and more), and found again from any device. Web app first, an iOS app later. Its core rule: highly
responsive, very lightweight, great UI/UX on phone and desktop. The person's constraints (2026-10-24): single user for
now, hosted on their own VPS, basic email sign-up auth, no Supabase.

## Scope

The options write-up for the web framework, the database, the auth approach (email sign-up), how the app runs on a VPS
(process, reverse proxy, TLS, backups), and how the shape leaves room for a native iOS app later.

## Out of scope

Building anything. The MVP's features are T-0002's.

## Notes
