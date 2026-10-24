---
id: ADR-0001   # a decision record; every field and how to fill it: skill workflow:decision
title: LinkSink keeps a full copy on every device and syncs it with its own small protocol over the VPS
status: accepted
date: 2026-10-24
scope: product
decided_by: person
superseded_by: null
---

# ADR-0001: LinkSink keeps a full copy on every device and syncs it with its own small protocol over the VPS

## Context

The person asked for data that is kept locally, synced across devices, and protected (private and never lost, not
end-to-end encrypted). The server is one SQLite file on their VPS, and a native iOS app follows. Options write-up:
`work/options/OPT-0002-sync.md`; research: message M-2026-10-24-7c0d5e6b.

## Options

- **A. Own sync** (chosen): server change log with one global version, idempotent pushes, pull since a cursor,
  tombstones. ~3–5 build days; no new service.
- **B. PowerSync:** maintained, Swift library, but needs Postgres/MongoDB plus its own service on the VPS.
- **C. Server first + cache:** least code, but offline you can only read and save.

## Decision

Every device keeps a full copy (web: IndexedDB with an in-memory search index; iOS: SQLite with FTS5). The VPS is the
main copy. Every write on the server runs in one transaction that bumps a single global `version` and stamps the rows
it changes. Devices push batches of mutations identified by `(client_id, mutation_id)`; the server skips any it has
already applied. Devices pull every row with `version > cursor`, deletions included. The server orders writes, so the
last write to reach it wins per row; tag assignments are `link_tags` rows, so adding and removing tags merge per tag.
Deletions are tombstones (`deleted_at`) kept 90 days; a device whose cursor is older than the tombstone floor pushes
its outbox and then downloads everything again.

## Consequences

- Every synced table carries `version` and `deleted_at` from the first migration, and every write goes through the
  versioned write path. Writing to a synced table any other way (a raw update without bumping `version`) silently
  breaks sync on other devices: that is the mistake this rules out.
- Client clocks never order anything; do not add timestamp-based conflict resolution.
- No sync engine dependency and no Postgres. Revisit only if LinkSink becomes multi-user or shared (then PowerSync
  with Postgres is worth its weight), or if a maintained engine appears with a SQLite server and a Swift client.
- We own sync bugs: lost offline edits, deleted links coming back, a device offline for months. Each gets a test.
- If real-iPhone measurements at 50,000 links show IndexedDB plus in-memory search too slow, the web store moves to
  SQLite in WASM behind the same storage interface; the protocol does not change.
