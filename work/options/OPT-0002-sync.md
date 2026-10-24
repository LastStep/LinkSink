---
id: OPT-0002   # an options write-up; every field and how to fill it: skill workflow:options
title: How should LinkSink keep a copy on every device and keep them in sync?
lane: director
status: decided
author: orchestrator
created: 2026-10-24
decided: 2026-10-24
chosen: A
---

# How should LinkSink keep a copy on every device and keep them in sync?

## Why this is being asked now

On 24 Oct you asked for data that is kept locally, synced across devices and protected (private and never lost, not
end-to-end encrypted). The draft plan only caches the list on each device and queues links saved offline, which is
lighter than what you described. How sync works shapes every table in the database, so it has to be settled before the
first build task creates them. Written by the orchestrator from researcher report M-2026-10-24-7c0d5e6b.

## What matters here

1. **Works fully offline on every device**: open, search, save, tag and edit with no connection, and everything
   catches up on its own.
2. **Never loses or resurrects anything**: an edit made offline is not dropped, and a link deleted on one device does
   not come back from another.
3. **Light and simple to run**: no extra database service on the VPS; the same sync serves the iOS app later.

## Options

What all three share: the VPS stays the main copy and is backed up (see "Protection" below); you sign in on each
device; signing out wipes that device's copy.

### A. Our own small sync (recommended)

Every device keeps a full copy of your links. Each change gets the next number in one counter on the server. A device
sends its changes, then asks "what changed since number N?" and gets just those, including deletions. If two devices
change the same link, the one that reached the server last wins. Deleted links leave a marker for 90 days so other
devices learn about the deletion; a device away longer than that simply downloads everything again. This is the design
behind Replicache and Linear's sync, cut down to one person.

- **Gets us:** full offline use everywhere; no new service on the VPS; the iOS app reuses the same few endpoints;
  every line understood.
- **Costs:** about 3–5 build days instead of about 1 for the plan's current outbox (an estimate, not measured), and
  sync bugs are ours to find (the tests target the known ones: lost offline edits, deleted links coming back, a
  device offline for months).
- **Reversible?** The server's tables carry what any sync engine needs, so moving to an engine later replaces only the
  device-side sync code: about one to two weeks.

### B. PowerSync (a ready-made sync engine)

A maintained engine with the best native iOS story: it keeps a SQLite copy on each device and syncs it for us.

- **Gets us:** sync code we don't write; a Swift library for the iOS app; multi-tab handling done.
- **Costs:** it cannot read from SQLite, so the VPS needs Postgres (or MySQL/MongoDB) plus PowerSync's own service and
  its storage database; the researcher found a dev setup listing a MongoDB node of 2 GB. That is two or three extra
  always-running services on your VPS, against the "light" rule. Its Swift support for app extensions (the iOS share
  sheet) is marked experimental. Licence: source-available (FSL) for the service.
- **Reversible?** Leaving it means rewriting sync on both sides and moving off Postgres if you want: about two weeks.

### C. Keep the current plan: server first, with a cache

The server stays the only real copy. Each device caches the list to open instantly and queues links you save offline,
but tagging, editing and deleting need a connection.

- **Gets us:** the least code (about 1 day); nothing to get out of sync.
- **Costs:** not what you asked for: offline you can only read and save, not organise. Search offline only covers
  what the device has cached.
- **Reversible?** Upgrading to A later: about 3–5 days, plus adding the sync columns to every table then.

Not offered: Electric and Zero (Postgres only), Replicache (archived June 2026; we borrow its design), Evolu
(end-to-end encrypted only, which you declined, and no iOS client), Triplit (future unclear), Jazz (alpha),
CRDT libraries like Automerge (built for documents, much heavier than a list of links needs).

## Comparison

| | A. Own sync | B. PowerSync | C. Server first + cache |
|---|---|---|---|
| Full offline use | Yes | Yes | Read and save only |
| Deletions and offline edits handled | Yes, tested by us | Yes, by the engine | Saves only |
| Extra services on the VPS | None | Postgres/Mongo + PowerSync | None |
| iOS app later | Same endpoints, ~500 lines Swift | Swift library (extensions experimental) | Same API |
| Build time | ~3–5 days | ~2–3 days + running Postgres | ~1 day |
| Reversibility | Device code: 1–2 weeks | ~2 weeks | Upgrade to A: 3–5 days |

## Where the copy lives on each device

- **Web (phone and desktop browsers):** IndexedDB, the browser's built-in database: no extra download, works in every
  Safari and Chrome, a few tens of MB for 50,000 links. Search on the device uses an in-memory index. If that proves
  slow on a real iPhone at 50,000 links, a full SQLite inside the browser can replace it behind the same interface.
- **Safari's 7-day rule:** Safari deletes stored data for a site you haven't opened in 7 days, but not for a site added
  to the Home Screen. So LinkSink asks to be added to the Home Screen, sends offline changes the moment it is online,
  and shows a badge while anything is unsynced. Even if a plain browser tab loses its copy, the server has everything
  except edits that never got online.
- **iOS app later:** SQLite with full-text search, the same sync endpoints.

## Protection (private and never lost)

- **In transit and access:** HTTPS, your login; each device's session can be listed and revoked from settings, and a
  revoked device stops syncing at once and wipes its copy when it next connects.
- **Never lost:** Litestream streams every change to a storage bucket with the provider's encryption, and every night a
  full snapshot is encrypted on the VPS (restic or Kopia) before it goes to a second bucket. You keep that encryption
  password in your password manager: lose the VPS and the backups are still readable by you, and only you. A restore
  is rehearsed during setup and then monthly. Each device's full copy is one more backup.
- **On the VPS's disk:** the database can sit on an encrypted volume (LUKS). This protects a stolen or snapshotted
  disk, not a hosting provider that can read the running server's memory; it depends on your provider and is decided at
  deploy time.

## Recommendation

**A. Our own small sync.** It is the only option that gives full offline use without adding a database service to
your VPS: every maintained engine with an iOS library needs Postgres or MongoDB beside it. What would change this: if
LinkSink later becomes multi-user or shared, B with Postgres becomes worth its weight; if real-iPhone measurements
show the browser copy too slow at 50,000 links, the device storage changes, not the sync.

## What happens next, either way

- **A:** the plan adds the sync columns (`version`, `deleted_at`) and a mutations table to the data model from the
  first build task, turns T-0010 into the sync client, and adds a measurement task (first sync of 50,000 links and
  cold start on your iPhone).
- **B:** the plan adds Postgres and PowerSync to the VPS in T-0005 and drops SQLite on the server.
- **C:** the plan stays as it is.

## Sources

From researcher report M-2026-10-24-7c0d5e6b (24 Oct 2026); quotes as read there.
- Replicache: "now in maintenance mode"; repo "archived by the owner on Jun 10, 2026". https://replicache.dev/ ,
  https://github.com/rocicorp/replicache
- Replicache global version: "A single global `version` is stored in the database and incremented on each push".
  https://doc.replicache.dev/strategies/global-version
- Replicache push idempotency: "skip this mutation if already processed". https://doc.replicache.dev/reference/server-push
- PowerSync service: "Supports Postgres, MongoDB, Azure DocumentDB, MySQL, and SQL Server". https://github.com/powersync-ja/powersync-service
- PowerSync open edition dev setup: "one MongoDB replica set node (2GB, 1 vCPU)" (May 2024).
  https://www.powersync.com/blog/powersync-open-edition-release
- PowerSync Swift: "app groups and extensions ... experimental". https://docs.powersync.com/client-sdks/reference/swift
- Electric: "a read-path sync engine for Postgres". https://github.com/electric-sql/electric
- Zero: "Today only Postgres is supported". https://zero.rocicorp.dev/docs/connecting-to-postgres
- Evolu: "all synced data are encrypted end-to-end". https://www.evolu.dev/docs/local-first
- Safari 7-day cap and Home Screen apps: "We do not expect the first-party in such a web application to have its website
  data deleted." https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- Litestream: "Age encryption is not available in v0.5.0+". https://litestream.io/docs/migration/
- restic: "All data stored by restic in the repository is encrypted with AES-256". https://restic.readthedocs.io/en/stable/100_references.html
- Better Auth: "revoked sessions may remain active on other devices until the cookie cache expires".
  https://www.better-auth.com/docs/concepts/session-management
- Build-time and code-size figures are the researcher's inference, not measured.
