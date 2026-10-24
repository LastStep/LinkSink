---
format: bonsai.run/1   # fields: bonsai check --schema bonsai.run; how to fill: skill base:run
id: R-2026-10-24-T-0007
task: T-0007
role: builder
model: opus
started: 2026-10-24 10:01
finished: 2026-10-24 10:55
outcome: needs-verifier
commits: ["42dbafe", "f1b9198", "fe9181a", "665abe9", "ccc4fdc", "b3f6944", "7ca23b4", "96d6dc3"]
labels: {}
---

# Run: Safe metadata fetcher — SSRF-guarded fetch, oEmbed and head parsing, image cache, Source and Media classifiers

> Opened at the start of the session and added to as it goes. Not written at the end.

## Log

- 10:01 Brief M-2026-10-24-afebfbe1 read; task, plan step 5, data model, SSRF row, risk, one-pager, T-0003 run
  report read. Worktree `/home/rohan/Apps/LinkSink-t0007`, branch `t0007-metadata-fetcher` from main 6f8397e (main
  moved one notes commit past the brief's 6c467c4). Node v22.21.1.
- 10:03 Dependencies added, exact pins: undici 8.12.3 (engines node >= 22.19; Node's built-in fetch exposes no
  Agent to plug a connector into), htmlparser2 12.0.0, sharp 0.35.5, tldts 7.4.19. No others.
- 10:08 safe.ts + addresses.ts, unit and integration tests (110). Check (b) is a custom undici connector (wrapping
  `buildConnector`) that resolves, checks every address and dials the validated one, rather than a `connect.lookup`
  option: same effect, and it does not depend on how net's autoSelectFamily calls lookup. First run: discarding a
  redirect's body threw an uncaught `UND_ERR_ABORTED` (destroyed stream with no error listener); fixed.
- 10:12 Mutation check: with both IP-literal checks (`checkUrl` and the connector's `pickAddress`) replaced by
  `false`, 13 SSRF tests fail and the trap counts connections (`expected 1 to be 0`). With only `checkUrl`'s off, all
  pass (the connector's check holds: defence in depth). First version of the test dialer threw for unmapped
  addresses, which made "trap never reached" vacuous under that mutation; it now dials every other address unchanged.
- 10:15 meta.ts + head.ts on recorded fixtures. Recorded once by hand with curl and the honest User-Agent
  `LinkSink/1.0 (+https://links.example.com)`: YouTube watch page + oEmbed, x.com status page + publish.x.com oEmbed,
  GitHub repo, Vimeo video, simonwillison.net article (og), example.com (title only), Reddit post. Reddit answered
  with a JS bot-check page titled "Reddit": kept as the recorded failure, not worked round. Vimeo's oEmbed endpoint
  answered 404. Two first-run reds: Node 22's `TextDecoder('windows-1252')` decodes 0x80-0x9F as C1 controls
  (ISO-8859-1), so `€ “ ”` came out wrong: decoded by the WHATWG table instead; and my JSON-LD fixture had an
  entity in script text (wrong HTML, my fixture's fault, fixed).
- 10:20 images.ts (sharp to WebP, ICO unpacked, SVG rasterised), media route, sources table + migration,
  classify/source.ts and media.ts, refresh.ts, queue.ts, app.ts.
- 10:22 `drizzle-kit generate` for 0002 wrote an invalid index line when it rebuilt `links`:
  ``CREATE INDEX `links_user_created` ON `links` (`user_id`,`"created_at" DESC`,`id`)`` (the expression wrapped in
  backticks; SQLite: `no such column: "created_at" DESC`). Hand-fixed that one line to 0000's form
  (`` (`user_id`,"created_at" DESC,`id`) ``); the journal and snapshots are as generated. The rebuild also drops the
  FTS triggers 0001 made, so 0003 (`--custom`) recreates them and rebuilds the index.
- 10:23 `open.spec.ts` pins the migration count (`toBe(2)` twice): now `toBe(4)`. The only edit to an existing test.
- 10:25 Mutation: with `applyMeta` ignoring `user_set`, the two user_set tests fail; restored.
- 10:30 First climb at 7ca23b4: rungs 0-3 green (unit 238, ratchet 29 -> 238), rung 4 red with 0 tests:
  `http://127.0.0.1:4173/login is already used` - another builder's e2e server (T-0006's `node
  scripts/e2e-server.js`, not mine, left alone) held the port. Once it ended, `npm run test:e2e` -> `3 passed`.

## What is different now

LinkSink can now fill in a saved link's details by itself, safely: given a link, it fetches the page openly as
"LinkSink", reads its title, summary, site name, author, date, a video's length, its icon and preview image
(YouTube through YouTube's own oEmbed, X from the x.com page), keeps small WebP copies of the image and icon on the
server, and works out the link's Source (YouTube for youtube.com and youtu.be, and so on, else the site's own name,
else its domain) and Media (Video, Repo, Post, PDF, Article, Image, Podcast or Page). Anything the person typed by
hand (title, description, source, media) is never overwritten. A site that refuses LinkSink leaves the link saved,
marked failed, titled by its address. It refuses to fetch anything on the server's own machine or private network,
however the address is disguised. Not yet visible in the app: the save path (T-0006's API) does not call it until
T-0006 lands and this branch is rebased and wired.

## Deviations from the plan

1. **Check (b) is a custom undici connector, not a `connect.lookup` option.** `createSafeFetch` gives the Agent a
   connect function that resolves the host itself, refuses it if any address is not public, and hands
   `buildConnector` the validated address (with the original name as TLS servername). Same guarantee, and it does not
   depend on how Node's autoSelectFamily calls `lookup`. The IP-literal check runs twice per hop: `checkUrl` before
   the request, and again in the connector (a mutation with only one removed stays green; with both removed 13 tests
   fail and the trap is reached).
2. **Sources are seeded in code, on a person's first fetch, not in SQL.** A migration runs before any user exists,
   and seeded rows must carry a sync version from `syncWrite`. `ensureSeedSources` seeds once per person, only if
   they never had a source (deleting them all does not bring them back).
3. **Preview images are two files:** `<sha256>.webp` (640 w, the one `image_path` names) and `<sha256>-320.webp`
   beside it. The hash is SHA-256 over `kind + "\n" + source bytes`, so the same image as icon and preview never
   collides. `favicon_path`/`image_path` hold the bare file name; the route is `/media/<name>` (signed-in only).
4. **The media folder is `media/` beside the database file** (`data/media` by default), not a new setting.
5. **One generated migration line hand-fixed** (drizzle-kit 0.31.11 bug, log 10:22) and **one existing test's pinned
   count changed** (`open.spec.ts`, migrations 2 -> 4).
6. **Not built here, left for the rebase onto T-0006:** the GET the client polls (`GET /api/links/:id`) is T-0006's
   route file; once it lands I check it returns `meta_state` and the fetched fields, and wire `enqueueFetch` into
   `POST /api/links`. `src/lib/fields.ts` does not exist yet; the media values live in `classify/media.ts` (`MEDIA`)
   and move there if T-0006/T-0008 adds it.
7. `.prettierignore` gains `src/lib/server/fetch/fixtures/` (recorded pages are kept byte for byte).

## Ladder

`bonsai ladder --task T-0007 --json` at **96d6dc3** (clean), result `.bonsai/local/ladder/T-0007.json`:
`"green": true`, `git.sha` `96d6dc36ccabecd41736330bab893f4586f1be53`, started 10:45:57Z, finished 10:46:27Z (it
waited about 12 minutes for the home-wide ladder lock held by other projects' climbs). A last climb follows the
commit of this report (doc-only); its sha is in the report to the orchestrator.

| Rung | Check | Result | Evidence |
|---|---|---|---|
| 0 | guard | green | `captures.checked` 51 paths, none outside the grant |
| 1 | `npm run check` | green | 7.7 s, 0 errors (`COMPLETED 1410 FILES 0 ERRORS` locally) |
| 2 | `npm run lint` | green | 7.1 s; `All matched files use Prettier code style!` |
| 3 | unit | green | `tests.seen` 238, 0 skipped; ratchet tests 29 -> 238 ok; 209 new tests |
| 4 | e2e | green | `tests.seen` 3 |
| 5 | build + size | green | `/` 36.4 kB, `/login` 36.26 kB, `/signup` 36.41 kB gzipped, limit 60 kB (unchanged: the fetcher is server-only) |

The earlier climb at 7ca23b4 was red on rung 4 only (port 4173 held by another builder's e2e server, log 10:30).

### done_when, line by line

1. *safe.ts refuses every SSRF case, unit + integration with a real listener on 127.0.0.1 never reached* - **ran**.
   `safe.spec.ts` "safe fetch refuses every case in the SSRF list; the trap is never reached": localhost,
   127.0.0.1, 2130706433, 0x7f000001, 0177.0.0.1, 127.1, [::1], [::ffff:127.0.0.1] (asserted normalised to
   `[::ffff:7f00:1]` in `addresses.spec.ts`), 127.0.0.1.nip.io (stub resolver), 169.254.169.254, 10.0.0.1,
   rebind.test (public then 127.0.0.1), v6loop.test, mapped.test, metadata.test; six "a redirect from a public stub
   to ..." cases (127.0.0.1, [::ffff:127.0.0.1], 2130706433, localhost, 127.0.0.1.nip.io, rebind.test). Each asserts
   `FetchRefused` and `trap.connections === 0`; "the trap counts a connection when one is made" proves the counter.
   `addresses.spec.ts`: 41 refused and 7 allowed addresses, 15 URL forms, the resolver cases. The test resolver and
   dialer never touch the internet.
2. *http/https on 80/443, <= 5 redirects re-checked, 8 s, 1 MB, Accept text/html, honest UA only* - **ran**.
   `safe.spec.ts`: "refuses other schemes and ports before connecting" (default ports, file:, ftp:), "follows 5
   redirects, each re-checked, and refuses a sixth", "gives up after the deadline" (1 s in the test; 8 s is
   `TIMEOUT_MS`), "caps a page at 1 MB", "fetches, sending only the honest User-Agent and the asked Accept".
   `boundaries.spec.ts`: the only server files that open outbound connections are `fetch/safe.ts` and `mail.ts`
   (Resend's API, not a page fetch: it sends Node's default UA, untouched, see Left for next time), and `safe.ts` is
   the only one that sets a User-Agent for a request.
3. *meta.ts fills the fields from oEmbed, og/twitter, JSON-LD, <title>; X from og; recorded fixtures* - **ran**.
   `meta.spec.ts` "meta from recorded pages": og, twitter only, JSON-LD only, title only, two broken-charset cases,
   YouTube (oEmbed title/author/thumbnail, `published_at` from uploadDate, `duration_s` 214 from PT3M34S), YouTube
   without oEmbed, X (og title and image, oEmbed author, tweet text as fallback description), GitHub, Vimeo,
   Reddit's bot page; plus `fetchMeta` through the guard against a local stub (discovered oEmbed, windows-1252,
   a PDF, a 403 not retried with another identity).
4. *Images via safe.ts, <= 5 MB, WebP under data/media/<sha256>.webp (320/640, favicon 64), nosniff, image types
   only, SVG rasterised* - **ran**. `images.spec.ts` (22 tests): sizes 640/320/64, no enlarging, SVG and ICO (PNG
   and 32-bit BMP entries), > 5 MB refused, non-image type refused, redirect to 127.0.0.1 refused with the trap at
   0, an SVG referencing a local address and file:///etc/passwd loads neither, `serveMedia` sends `image/webp`,
   `nosniff`, `default-src 'none'` and 404s seven bad names. Route: `src/routes/media/[file]/+server.ts`.
5. *sources table + seed; longest suffix (youtu.be is YouTube), else og:site_name, else registrable domain; media's
   six rules, one recorded fixture per rule* - **ran**. `source.spec.ts` (21), `media.spec.ts` (10, rules 1-6 each on
   a fixture), `sources-migration.spec.ts` (old links kept, search works, FK to sources and user).
6. *A refetch never writes a user_set field* - **ran**. `refresh.spec.ts` "a refetch never writes title,
   description, source or media the person set" and "only the fields in user_set are kept"; both fail when
   `applyMeta` ignores `user_set` (log 10:25).
7. *In-process queue, concurrency 2, retry once; failure -> failed + hostname title; syncWrite* - **ran**.
   `queue.spec.ts` (6): "runs at most two at a time", retry once, give up after the retry, refused never retried.
   `refresh.spec.ts`: a blocking site -> tried twice, `meta_state` failed, title `blog.test`; versions equal the
   user's `sync_meta.version` after each write; `boundaries.spec.ts`: no direct `db.`/`tx.` insert, update or delete
   in fetch/ or classify/. `enqueueFetch(linkId)` exported from `src/lib/server/fetch/queue.ts`; not yet called
   by the app (T-0006's POST, at rebase).
8. *The ladder climbs green at the branch's HEAD* - see Ladder.

## What did not work

- First climb red on rung 4: another builder's e2e server held port 4173 (both worktrees' Playwright configs use
  it). Not a code fault, but two builders climbing at once will keep colliding there.
- drizzle-kit wrote an invalid index statement when it rebuilt `links`; generating migrations that rebuild `links`
  will hit it again (T-0006, T-0008).
- Node 22's windows-1252 decoder is wrong for 0x80-0x9F; worked round with the WHATWG table.
- Reddit gives an honest User-Agent a bot-check page: those links get the title "Reddit" and no image (Source Reddit
  and Media Post still come from the URL). Not worked round, per the plan.
- Vimeo's oEmbed endpoint answered 404; Vimeo links get their details from the page's og tags instead.
- My first test dialer threw for unmapped addresses, which made "trap never reached" true for the wrong reason
  (log 10:12); fixed before it counted.
- Not run: any fetch from the app itself (nothing calls `enqueueFetch` until T-0006); fetching real sites from the
  VPS (the plan's manual check of 10 URLs, T-0005's box); the media route over HTTP (its handler is tested as a
  function, the route file only type-checked).

## Evidence for a human

Nothing to click yet: it shows once T-0006's paste box calls it. To see the guard: in the worktree, `npx vitest --run
src/lib/server/fetch/safe.spec.ts` lists each refused address by name.

## Files changed

- Guarded fetch: `src/lib/server/fetch/addresses.ts` (deny ranges), `safe.ts` (checks a and b, redirects, deadline,
  caps, the one User-Agent).
- Page details: `head.ts` (charset, head parser, JSON-LD), `meta.ts` (field choice, oEmbed, YouTube and X),
  `fixtures/` (recorded and hand-written pages, README).
- Images: `images.ts` (WebP cache, ICO, SVG, `serveMedia`), `paths.ts`, `src/routes/media/[file]/+server.ts`.
- Classifiers: `src/lib/server/classify/source.ts` (seed, longest suffix, site name, domain), `media.ts` (six rules).
- Writing: `refresh.ts` (apply details respecting `user_set`, failure), `queue.ts` (`createFetchQueue`,
  `enqueueFetch`), `app.ts` (the app's queue).
- Database: `schema.ts` (`sources`, FK on `links.source_id`), `drizzle/0002_sources.sql`,
  `drizzle/0003_links_fts_triggers.sql`, snapshots and journal from drizzle-kit.
- Tests: `addresses.spec.ts`, `safe.spec.ts`, `meta.spec.ts`, `images.spec.ts`, `refresh.spec.ts`, `queue.spec.ts`,
  `boundaries.spec.ts`, `classify/*.spec.ts`, `db/sources-migration.spec.ts`, helpers in `fetch/test/`;
  `db/open.spec.ts` count 2 -> 4.
- `package.json`/lock: undici 8.12.3, htmlparser2 12.0.0, sharp 0.35.5, tldts 7.4.19 (production dependencies).
  `.prettierignore`: the fixtures folder.

## Processes left running

None. Playwright started and stopped its e2e server on each run; the climbs ended. Checked with `ps -eo
pid,etime,cmd | grep -E "LinkSink-t0007|e2e-server|vitest|playwright"` at 10:55: nothing. Other agents' climbs
(T-0006, and Bonsai's own T-5736/T-5737) were running and were left alone.

## What it cost

About 55 minutes wall-clock (10:01 to 10:56 UTC), of which about 12 waiting for the ladder lock; one builder session
on opus, brief M-2026-10-24-afebfbe1. Spend not known to me; the hours are T-0007's rows in `.bonsai/sessions.md`.

## Left for next time

- Rebase onto T-0006 when it lands: renumber my migrations after its own (drizzle-kit generate again; re-check the
  index line it writes), wire `enqueueFetch(id)` after the insert in `POST /api/links`, confirm its `GET
  /api/links/:id` returns `meta_state` and the fetched fields, move `MEDIA` into `src/lib/fields.ts` if it exists.
- The security-lens verifier the plan names for T-0007.
- Proposed task: e2e port per worktree (Playwright's 4173 is shared by every builder's climb).
- Proposed task: the mailer's Resend call sends Node's default User-Agent; give it LinkSink's if wanted.
- T-0005: sharp ships prebuilt binaries for linux-x64 (`@img/sharp-linux-x64`); `npm ci --omit=dev` on the VPS
  needs no compiler, unverified there. The plan's manual check of 10 real URLs from the VPS.

## Verifier

> Added by the verifier, in a fresh context. Pass or fail, with reasons.
