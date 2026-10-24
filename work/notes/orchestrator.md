# Orchestrator notes — LinkSink planning (T-0001, T-0002)

Re-read before each question to the person and before writing the plan.

## The person's word (2026-10-24)

- Paste a link into the app and it is saved. Tags of different kinds: category, source, project, etc.
- One hub, reachable from anywhere. Web app now, iOS app later.
- Core rule: highly responsive, very lightweight, great UI/UX on phone and desktop.
- Single user for now ("lets just build it for me").
- Hosted on their own personal VPS.
- Basic email sign-up auth; no Supabase.
- UI design uses taste-skill (installed, user scope, `taste-skill:design-taste-frontend`); app screens follow its
  `references/app-screens.md` run (`draw.mjs --app`, `inspect.mjs --app`). Needs Node 22+ (have v22.21.1) and a
  Chrome/Chromium: none installed in this WSL yet.

## Research briefs

- M-2026-10-24-23ad49b1 researcher@T-0001: framework, DB, auth, VPS.
- M-2026-10-24-29d18b1b researcher@T-0002: product landscape, MVP set.
- M-2026-10-24-d9fcaf61 researcher@T-0002#2: metadata fetching, SSRF, phone capture, feeling instant.

## Findings

### Stack — report M-2026-10-24-3d020f86 (done)

- Verdict: SvelteKit (3.1.0, Svelte 5.57) + SQLite via better-sqlite3 13 (bundles FTS5) in WAL + Drizzle 0.45.4
  (pin; v1 is RC) with FTS5 as raw SQL migrations + Better Auth 1.7.x (email/password, verification, reset; override
  scrypt with argon2id; Bearer plugin for iOS) + Resend free (100/day) for mail + adapter-node on Node 22 behind
  Caddy, systemd units, Litestream + nightly `.backup` offsite.
- Runner-up for weight: Hono + server HTML (but no client-nav feel). Next.js wrong on weight; Astro wrong for an
  all-interactive app. No primary bundle numbers exist.
- Alt auth: hand-rolled per Copenhagen Book (argon2id 19 MiB / 2 iters / p1); Lucia deprecated Mar 2025; Auth.js
  now steers to Better Auth.
- Risk 1: SvelteKit 3.0 shipped 1 Oct; Better Auth docs say SvelteKit 2.20+; unconfirmed on 3.x → a walking-skeleton
  spike settles it (fallback: SvelteKit 2.x, or hand-rolled auth).
- Risk: better-sqlite3 native module vs Node majors; node:sqlite RC is the exit. Rehearse a Litestream restore.
- Deploy: build off-box (CI), releases/<sha> + `current` symlink + restart; migrations before restart. 1 GB VPS
  comfortable.

### Product — report M-2026-10-24-33b09aa7 (done)

- No surveyed tool has first-class tag groups (Raindrop = 1 collection + tags; Karakeep = lists + tags; Anybox =
  nested tags). LinkSink's grouped tags = differentiator and main design risk. Keep model simple: a tag belongs to
  one group; a link has many tags; filter AND across groups, OR within a group.
- Weight comes from archiving/headless browsers (Linkwarden 350–700 MB idle, ~12 GB / 4k links; Karakeep 3
  containers). Linkding: one container on SQLite, "minimal, fast". → No archiving in MVP.
- Pocket (Oct 2025) and Omnivore (Nov 2024) shut down → export from day one (Netscape HTML + JSON).
- Must: paste box, save instantly, metadata in background; tag groups; Unsorted inbox; filter + keyword search
  (title/URL/note/tags); duplicate check on paste; edit/delete/note; list view phone+desktop; export.
- Should: domain auto-tag rules (fills "source"); bookmarklet; keys (n, /, arrows) + command palette (a differentiator
  — none documents one); saved filters; card/grid toggle.
- Later: extension, archive, page full-text, dead links, dupe-cleanup UI, AI tags, reader view, iOS, sharing.
- Budget suggestion: INP ≤ 200 ms (web.dev "good").
- Open: import (Netscape HTML) was out of scope in T-0002; researcher suggests it with export. → ask the person.

### Technical edges — report M-2026-10-24-71dcc595 (done)

- Researcher tried bot-style UAs to probe og tags; auto-mode denied it as bot-check circumvention; it stopped. →
  Policy in the plan: honest UA (`LinkSink/1.0 (+https://<host>)`), no spoofing; a site that blocks gets saved with
  hostname as title, editable.
- Metadata: oEmbed first (YouTube oEmbed works keyless, gives title + thumbnail; X publish oEmbed gives author+text, no
  image), then og/twitter, JSON-LD, <title>. Reddit/Instagram/Medium/Amazon unconfirmed → best-effort; re-test from VPS IP.
  Parser: ~100 lines on htmlparser2 reading only to </head> (or metascraper on our own fetch). Avoid unfurl.js
  (archived Jun 2026). Limits: 5–8 s, ≤1 MB, ≤5 redirects, http/https only.
- Images: cache locally via the same safe fetcher, sharp → WebP 320/640, content-hash names, nosniff; favicon 64 px.
- SSRF: own undici Agent with `connect.lookup` validating every resolved address (v4+v6, mapped, metadata IP) and
  connecting to the validated IP; `redirect: 'manual'` loop re-checking each hop, cap 5; ports 80/443. Unit tests:
  localhost, 127.0.0.1.nip.io, ::ffff:127.0.0.1, 169.254.169.254, redirect to 127.0.0.1, rebinding stub.
  (request-filtering-agent: two advisories, http.Agent only.)
- Dupes: store `url` (cleaned) + `url_key` (normalised: lowercase host, drop fragment/default port/www-for-compare/
  trailing slash, sorted query, tracker denylist utm_* fbclid gclid mc_* igshid; keep YouTube v/t). Unique
  (user_id, url_key).
- iOS Safari: NO Web Share Target (WebKit bug 194593 open). Phone capture: iOS = Shortcut in share sheet POSTing
  {url} with a revocable add-only bearer token (needs a real TLS cert); Android = installed PWA share_target (parse URL
  from `text`); both = paste event in an always-ready input (no permission prompt). Bookmarklet = desktop fallback.
- Instant: SvelteKit service worker (app shell cache-first, version-scoped), IndexedDB list cache with
  stale-while-revalidate, optimistic insert with client id, server returns 201 at once and fills metadata async (poll/
  SSE), offline queue retried on focus (no Background Sync on iOS). Lists: paging + content-visibility, or TanStack
  Virtual. FTS5 at 100k: p95 < 1 ms word, ~2 ms trigram prefix (synthetic). unicode61 + prefix='2 3' default.
- Targets: paste→row < 100 ms; keystroke→results < 50 ms; initial JS ≤ ~60 KB gz; cold interactive < 1 s on 4G; warm
  < 300 ms; INP ≤ 200 ms.

### Facts lens — M-2026-10-24-b9067987: FAIL, 5 blocking (all held, all fixed)

1. adapter-node `ORIGIN` removed in kit 3 → `kit.paths.origin`. 2. `$app/service-worker` exports only `self`;
`version` from `$app/env`, file lists from `$app/manifest`. 3. Node skips `lookup` for IP-literal hosts → SSRF guard
needs a literal check per hop (verifier proved 127.0.0.1 got through). 4. X oEmbed has no title/image → read x.com og
tags. 5. Better Auth does declare SvelteKit 3 (peer ^2 || ^3). Non-blocking: Node ≥ 22.19, TS ~6, `#lib`,
@size-limit/file, `auth` CLI package, Shortcut Headers field unconfirmed by Apple docs.
Re-check M-2026-10-24-488cd114: PASS (added the [::ffff:7f00:1] hex-mapped case to the test list).

## Open questions for the person

1. Stack: OPT-0001 (recommend A).
2. Import from Netscape HTML in the MVP? (recommend yes: small, and moves the person's existing bookmarks in)
3. Tags outside any group? (recommend: every tag sits in a group; a default "Tags" group catches the rest)
4. VPS facts (OS, RAM, a domain pointing at it) — needed at the deploy task, not now.

## The person's word, round 2 (2026-10-24 07:22 UTC)

- Docs "look fine". Uneasy about (1) Svelte: never used it, unsure how good the UI/UX can be; wants minimal UI with
  smooth soft animations; (2) data: protected, local seems good, must sync across devices.
- Wants an Obsidian-like graph view of links → answered: **later, no rush** (after phone capture and iOS app; own
  one-pager). Proposed model: links + tags as nodes coloured by group, link–tag edges, optional same-domain clusters,
  local graph per node; libs force-graph / sigma.js+graphology / d3-force, lazy-loaded route.
- Protection → **private + never lost** (not E2EE): HTTPS, login, encrypted disk/backups, full copy on each device.
- Frameworks known → **none**. So Svelte stays a candidate (closest to plain HTML/CSS); a Svelte motion spike shows the
  feel before they decide.
- Local-first with two-way sync is now in scope → plan's IndexedDB-cache + outbox (step 8) gets replaced by real sync.

Briefs: M-2026-10-24-fa4573a1 researcher@T-0001#2 (local-first sync, storage, engines, own protocol, protection);
M-2026-10-24-04713a99 builder@T-0001 (Svelte motion spike in scratchpad/T-0001/spike, static build to publish as
an artifact for the person to open on phone and desktop).

## Decisions

### Sync — report M-2026-10-24-7c0d5e6b (done)

- Recommend own sync: server change log with one global `version` bumped per write; push batches with
  (clientId, mutationId) idempotency (Replicache server-push pattern); pull `since=N` incl. tombstones; server orders
  writes (no client clocks); row-level LWW; `link_tags` as rows so tag add/remove merge; tombstones purged after ~90
  days with a `tombstone_floor` → device below it pushes outbox then full resync. ~700–1100 lines server+web, 3–5
  builder days (inference) vs ~1 day for the outbox.
- No engine fits: PowerSync (best Swift story) needs Postgres/Mongo/MySQL/MSSQL source + bucket store; Electric/Zero
  Postgres-only; Replicache archived 2026-06-10 (protocol docs still the best reference); Evolu E2E-only, no Swift;
  Triplit future unclear (Supabase hired founder); Jazz 2.0 alpha; cr-sqlite slow inserts.
- Web store: IndexedDB + in-memory search (no extra download/worker/headers); SQLite-WASM (wa-sqlite
  OPFSCoopSyncVFS on Safari) a later swap behind a storage interface. iOS: SQLite + FTS5.
- Safari 7-day eviction for plain tabs; Home Screen apps keep data; persist() granted by heuristics (installed). Server
  stays source of truth → only unsynced edits in an evicted tab are at risk → flush outbox ASAP, persist(), "Add to
  Home Screen" prompt, unsynced badge.
- Protection: Litestream 0.5 has no Age → bucket SSE for Litestream + nightly `.backup` into restic/Kopia
  (client-side encrypted) to a second bucket; password kept in the person's password manager; monthly restore test.
  LUKS on a data volume possible on KVM VPS (protects at rest only). Better Auth: list/revoke sessions; disable or
  shorten cookieCache; wipe local copy on logout or 401 after one outbox flush.
- Plan impact: `version`, `deleted_at`, `sync_mutations` (client_id, last_mutation_id) in the data model from T-0003;
  T-0010 becomes a sync client; add a runner task measuring 50k first-sync + cold start on a real iPhone.

## Decisions

- 2026-10-24 sync → OPT-0002 A, own sync (ADR-0001, person's word "go with A for sync"). Plan and one-pager updated:
  sync columns from T-0003, store interface in T-0006, T-0010 = sync, T-0011 = PWA + phone capture, T-0012 =
  export/import, T-0013 = runner measuring 50k-link sync.
- Graph view: later, own one-pager.

## Spike — report M-2026-10-24-f816f00b (done)

- SvelteKit 3.1 static spike, 69 real links, motion via Svelte built-ins only; `?motion=svelte|none`.
- JS 43.7 KB gz total (≈33 KB framework, 8.6 KB page + data); CSS 2.3 KB gz; 0 runtime deps.
- Republished with `kit.appDir: 'app'` (artifact host reserves `_` names); normalised diff identical to the reviewed
  build. Artifact: https://claude.ai/artifact/1yM2Fg6d2HQKsVPXPSrCK1 . Original build kept in spike/build-underscore.

## Open for the person now

1. Stack: OPT-0001 (recommend A) — after trying the spike.
2. Import in MVP? (recommend yes). 3. Tags outside groups? (recommend no + default "Tags" group).
4. Then approve F-web-mvp and P-T-0002.

## Round 3 (2026-10-24 07:49–07:55 UTC)

- Stack → A (ADR-0002, OPT-0001 decided). Import → yes.
- Fields (person's vision): Source (one, auto), Media (one, auto if possible), Tags (many, free), Projects (many,
  user collections), Title (auto, editable), Description (auto from page, editable, never overwritten once edited),
  Notes, + optional Status (to read/in progress/done) and Priority (low/med/high), + Archive. Metadata: created,
  updated, opened, saved_via, site_name, author, published_at, duration. No other custom fields. F-web-mvp rewritten;
  plan data model + T-0007 classifiers + T-0008/T-0009/T-0010/T-0012 updated. Old tag-groups model gone.
- Person: demo UI "boring" → wants good mockups with Fable + taste-skill. T-0004 (director lane, running) briefed:
  M-2026-10-24-c8915117 builder@T-0004 model fable; three directions, 6 screens, phone+desktop, light+dark, real data,
  out/ folder to publish as an artifact.
- Open: approve F-web-mvp and P-T-0002 (after the look is picked, or now — person's choice).

## T-0004 design — report M-2026-10-24-2f8b5d98 (done)

- Three directions (Fable builder, taste-skill app run): A Ledger (Geist, achromatic, day-grouped ledger, one blue),
  B Shelf (DM Sans, page pictures lead rows, raspberry accent ladder, centred dialog), C Night stream (Inter, true
  black, media-shaped rows, lime on data, drawer). inspect.mjs --app: 0 FAIL on all six (A has 1 defended WARN).
- 11 screens per direction via a Screen picker; phone/desktop and light/dark toggles; real data (72 links).
- Not built: swipe on phone rows. C light is the least distinctive (builder's own note).
- I read every text file and viewed every image (contact sheet) before publishing:
  https://claude.ai/artifact/TMwfMgvW24UQoZcMvevNvZ
- Next: the person picks (or asks for a mix/revision) → ADR → design/tokens.css + reference screens in repo.

## Build session 1 (2026-10-24 09:05 UTC)

- Person approved T-0003 itself (full lane needs the task's own `approved`; committed 1e31d17), moved to running (fb3726e).
- Brief M-2026-10-24-b9633541 builder@T-0003 (opus), worktree ../LinkSink-t0003, branch t0003-walking-skeleton. Waiting.
- Next on its report: read the diff, security + tests-and-correctness verifiers (auth), hand the person the ladder lines.
- Builder report M-2026-10-24-fdb03267: done, HEAD b742f91 (code 9943d1c). Better Auth 1.7.12 works on kit 3.1.0. 36.4 KB gz first load. 23 unit, 2 e2e. Its own npm-format slip on Bonsai files undone (diff empty, I checked).
- Verifiers: M-2026-10-24-7180a2a9 security (verifier@T-0003), M-2026-10-24-d3f07f41 tests (verifier@T-0003#2). Waiting.
- Tests verifier M-2026-10-24-fe575768: FAIL, 1 blocking (held: I confirmed the gitignored .env in the worktree): clean checkout `npm run build` / `test:e2e` exit 1, src/env.ts demands BETTER_AUTH_SECRET + ORIGIN at build; e2e-server.js sets the secret only after the build. Non-blocking: immediate-vs-deferred untested; SyncWriter exposes raw tx; FTS on rowid vs VACUUM (T-0005); build-time secret vs CI build.
- Waiting on security before one combined fix brief to the builder.
- Security verifier M-2026-10-24-b0286f15: PASS, 0 blocking. Race test: 2–100 concurrent sign-ups → always 1 user. Risks: form login skips rate limit; console mailer used in prod if no Resend key (tokens in log); losers of race told "sent"; rate-limit IP behind Caddy (T-0005: advanced.ipAddress); drizzle-kit audit (esbuild dev server, moderate); build-time secret; raw error on form.
- Fix brief M-2026-10-24-a4e59799 (resumed builder): clean-checkout build/e2e (blocking), form rate limit, prod mailer must fail without Resend key, generic form errors.
- Carry to T-0005: rate-limit IP header, FTS rowid vs VACUUM INTO, CI build env, drizzle-kit audit.
- Fix report M-2026-10-24-af9dc8b7 done; my clean-copy run at 8d49111 all green (29 unit, 3 e2e, 36.4 KB). Landed ff to main. T-0003 → verify; person to paste ladder and close.
- 09:59 ladder committed by the person (e15441f), T-0003 green and done.
- 10:00 person approved T-0006 and T-0007 (committed), both running at 6c467c4. Briefs: M-2026-10-24-d6363978 builder@T-0006, M-2026-10-24-afebfbe1 builder@T-0007 (both opus). Contract: T-0007 owns fetch/ + classify/, exports enqueueFetch; T-0006 lands first; I resume T-0007 to rebase and wire it. T-0006: PATCH adds to user_set.
- Verifiers when done: T-0006 tests + QA (screens are plain; QA light); T-0007 security + tests.
- T-0006 report M-2026-10-24-2d8c29cc: done, HEAD 0de0f3e, ladder green there (101 unit, 8 e2e, 39.95 KB). Deviations: restore endpoint (T-0010 needs link.restore); JSON content-type required on every write incl. DELETE (T-0011 Shortcut must send it); no sources table; http vs https stay separate (ask the person). enqueueFetch goes in create() in src/lib/server/api/links.ts.
- Verifiers: M-2026-10-24-0fe20bcb tests (opus), M-2026-10-24-3efe2314 QA (sonnet). Waiting.
- Person 10:26: "we should only be serving https". → T-0005: HTTPS only (Caddy redirects http→https, HSTS header, secure cookies, ORIGIN https). Saved-link http vs https duplicate question still open (recommended: same key, address kept as given).
- Person 10:27: http and https of the same address = one link (url_key ignores scheme; address kept as given). Goes in T-0006's fix round. "Keep building the app."
- QA M-2026-10-24-8e222395: FAIL, 1 blocking, held (I saw the screenshot): duplicate flash row uses --mark (= --text), title unreadable (black bar light / white dark), +page.svelte:293-297. Non-blocking: bodiless Bearer DELETE w/o JSON content-type → 403 (SvelteKit CSRF). Waiting on tests verifier.
- Person 10:31: approved T-0008 (starts after T-0006 and T-0007 land).
- Tests M-2026-10-24-2c4ae866: PASS (18/19 unit mutants, 6/6 e2e caught; the survivor is equivalent). Note: the guard refused its tools in a scratchpad copy, so it re-extracted without bonsai.yaml/CLAUDE.md/work — told the person.
- Fix brief M-2026-10-24-42114003 to builder@T-0006: flash contrast (blocking), http/https one key.
- 10:40 WebKit 26.4 (playwright webkit-2287, matching @playwright/test 1.60.0) installed and launches; system deps installed by the person. QA from T-0008 on also runs WebKit. Verifier briefs: make scratch copies without bonsai.yaml/CLAUDE.md/work from the start.
- 10:48 T-0006 landed (merge 8ce031c, ladder green on main, 102 unit / 10 e2e), to verify. Next: resume T-0007 to rebase on main and wire enqueueFetch into create() in src/lib/server/api/links.ts once it reports.
- T-0007 report M-2026-10-24-c9013291: done at c43c739 (238 unit, green). Deviations: custom undici connector; sources seeded in code via syncWrite on first fetch; drizzle 0002 index line hand-fixed + 0003 restores FTS triggers; open.spec migration count 2→4; Reddit returns bot-check (title "Reddit"); deps undici 8.12.3, htmlparser2 12, sharp 0.35.5, tldts 7.4.19. Proposed: e2e port per worktree (in rebase brief), Resend UA, T-0005 10-URL check.
- Rebase+wire brief M-2026-10-24-bfabed75 (enqueueFetch in create, poll GET, fixture e2e with narrow test-only SSRF allowance, E2E_PORT). Then verifiers: security (opus) + tests (opus) on the rebased HEAD; scratch copies without bonsai.yaml/CLAUDE.md/work.
- 11:11 T-0007 rebased+wired, report M-2026-10-24-a23a6a3b, HEAD a66660d on main cfffb0e, ladder green (329 unit, 11 e2e, 40.33 KB). onCreated hook → enqueueFetch; poll 1 s × 10; TEST_ONLY_FETCH_ALLOW only with MAIL_TRANSPORT=console; E2E_PORT. Touched T-0006 files: patchLink 400 on unknown source (FK), one setup line in links.spec.
- Verifiers: M-2026-10-24-3e2e851c security (opus), M-2026-10-24-f74a408b tests (opus). Waiting.
- 11:15 Person couldn't confirm sign-up in dev: the console mail went to an earlier dev run's terminal; unverified account blocks sign-up and login with no resend. Told them to reset the dev DB (0 links). Bug to fix before T-0005: emailVerification.sendOnSignIn true + login page message + e2e (fold into T-0008's start or a light task).
- 11:17 The person closed T-0006 (done) after using it.
- 11:19 T-0014 (light lane, resend confirmation on login) written+running; brief M-2026-10-24-e60ba01b builder@T-0014 (sonnet, 60 min). Light lane: I read the diff instead of verifiers.
- 11:21 Person: Docker setup for deploy, 'deploy it anywhere' → ADR-0004 accepted (replaces systemd part of ADR-0002 / plan step 3). Open for T-0005: runtime vs build-time origin.
- Security T-0007 M-2026-10-24-8e907844: PASS, 0 blocking (trap 0 connections over 52 literal spellings, DNS, rebinding, redirects; limits; image bombs; XSS none). Non-blocking: 8 s deadline fires ~11 s on back-to-back hung requests (done_when says 8 s → fix in a small round); allowance lacks NODE_ENV check; /media no per-user ownership (unguessable names). Waiting on tests verifier.
- Tests T-0007 M-2026-10-24-73559a62: PASS, 0 blocking. Risks: 0002 migration FK fails on orphan source_id (PRAGMA off inside txn is a no-op); surviving mutants (redirect hop scheme/port, 8 s, 5 MB boundary, Accept, media order, suffix order, failure keeps person's title, charset precedence, filename pattern). It edited files inside its scratch copy (copy held .bonsai) and pkill'd e2e-server.js, possibly T-0014's. I deleted its leftover probe file in the scratch copy; warned builder@T-0014.
- Fix brief M-2026-10-24-4402dc7f to builder@T-0007 (E2E_PORT=4500).
- Lesson for verifier briefs: archive copies exclude .bonsai, .claude, bonsai.yaml, CLAUDE.md, work; never pkill by pattern, stop only own pids.
- 11:31 T-0014 landed (843cf86), done, ladder green on main 99f5e10 (102 unit, 13 e2e). Told builder@T-0007 to rebase onto it after its fixes (skeleton.e2e.ts overlap).
- 11:55 T-0007 landed (merge into main), to verify. Next: T-0008 builder.
- 11:58 T-0007 ladder green on main 5e9fc85 (346 unit, 14 e2e) after npm ci (main's node_modules lacked T-0007 deps). T-0008 running.
- 12:00 T-0008 brief M-2026-10-24-1ce98ac1 builder@T-0008 (opus, E2E_PORT=4600), ordered so a budget cut leaves usable work. Verifiers when done: tests + QA (Chromium + WebKit, 390/1440, light/dark), then the person looks.
- 12:45 T-0008 report M-2026-10-24-454f54a8: done at 40ab5cc (363 unit, 22 e2e, WebKit 22/22 too; `/` 56.22 KB). I viewed detail-1440-light and links-390-dark-webkit: Ledger look holds. Found: invisible 1 px img.preview kept to satisfy T-0007's e2e (gaming) → fix round M-2026-10-24-15deecb5 (+ lazy-load organiser/details/bulk, size-limit all layouts, taste-skill placeholder). Then tests + QA verifiers, then the person looks.
