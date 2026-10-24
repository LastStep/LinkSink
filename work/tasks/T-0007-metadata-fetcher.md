---
format: bonsai.task/1   # fields: bonsai check --schema bonsai.task; how to fill: skill base:task
id: T-0007
title: Safe metadata fetcher — SSRF-guarded fetch, oEmbed and head parsing, image cache, Source and Media classifiers
status: running
lane: full
done_when:
  - "src/lib/server/fetch/safe.ts refuses every case in the plan's SSRF list (IP-literal forms incl. [::ffff:7f00:1], 127.0.0.1.nip.io, 169.254.169.254, private ranges, a redirect to 127.0.0.1, a public-then-private resolver), proved by unit tests and an integration test with a real listener on 127.0.0.1 that is never reached"
  - "Only http/https on ports 80/443, at most 5 redirects each re-checked, 8 s total, 1 MB cap, Accept text/html, User-Agent LinkSink/1.0 (+https://<host>); no other User-Agent anywhere"
  - "meta.ts fills title, description, site_name, author, published_at, duration_s, icon and preview image from oEmbed (YouTube), og/twitter, JSON-LD and <title>, with X links read from the page's og tags, proved on recorded fixtures (og, twitter, JSON-LD, title-only, broken charset, YouTube and X)"
  - "Images and favicons are fetched through safe.ts, at most 5 MB, stored as WebP under data/media/<sha256>.webp (preview 320/640 w, favicon 64), served with nosniff and image types only; SVG is rasterised, never served raw"
  - "The sources table exists with its seeded hosts; classify/source.ts resolves the longest host suffix (youtu.be is YouTube), else og:site_name, else the registrable domain; classify/media.ts follows the plan's six rules in order, one recorded fixture per rule"
  - "A refetch never writes title, description, source_id or media when that field is in the link's user_set (unit test)"
  - "Fetching runs in-process after the save (queue, concurrency 2, retry once); a failure sets meta_state failed and the title stays the hostname; all link writes go through syncWrite"
  - "The ladder climbs green at the branch's HEAD"
depends_on: [T-0003]
blocked_by: null
created: 2026-10-24
started: 2026-10-24
finished: null
labels:
  bonsai.branch: t0007-metadata-fetcher
  bonsai.ladder: []
  bonsai.allows: []
  bonsai.wants: []
  workflow.owner: builder
  workflow.feature: F-web-mvp
  workflow.estimate_h: 6
---

# Safe metadata fetcher

## Context

Plan `work/plans/P-T-0002.md`, Approach step 5 (T-0007), its Data model (`links` from-the-page fields, `sources`,
`user_set`), the SSRF row of "How it gets proved", and "Risk in the code" (never spoof a User-Agent or use a headless
browser; a blocked site still saves). One-pager `work/features/F-web-mvp.md`: the title/description/icon, Source and
Media done-when lines.

## Scope

`src/lib/server/fetch/`, `src/lib/server/classify/`, the `sources` migration and seed, the media route, the queue, an
entry point the save path calls (`enqueueFetch(linkId)`), and the GET the client polls.

## Out of scope

The links API and paste (T-0006, which calls `enqueueFetch`; until it lands, test through the queue directly). Source
rename in settings (T-0008). Runs beside T-0006 on disjoint folders; its migration lands after T-0006's.

## Notes
