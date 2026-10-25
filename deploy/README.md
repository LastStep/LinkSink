# Running LinkSink with Docker on this machine

LinkSink runs as two containers: `app` (the LinkSink server) and `caddy` (in front of it, serving HTTPS). Your
links and account live in a Docker volume, so they survive restarts. Run every command below in a WSL terminal, in
the LinkSink folder.

## Before you start

- Docker Desktop is running, with WSL integration on for this distribution (Settings, Resources, WSL Integration).
  `docker compose version` answers.
- Port 443 is free. Port 80 is not, on this machine: Apache in WSL holds it. You need not stop Apache: the example
  settings publish Caddy's plain http on port 8080 instead (`LINKSINK_HTTP_PORT=8080`). Plain http only redirects
  to https, so http://localhost:8080 takes you to https://localhost.

## 1. Write the settings

The settings live in a file named `.env` beside `compose.yaml`. `deploy/env.example` lists each one with a comment.

```bash
# No .env yet:
cp deploy/env.example .env
# Or, if you already have a .env for `npm run dev`, add the LinkSink lines to it (they never clash):
cat deploy/env.example >> .env

# Give it a secret of its own:
sed -i "s|^LINKSINK_AUTH_SECRET=.*|LINKSINK_AUTH_SECRET=$(openssl rand -base64 32)|" .env
```

For this machine, keep the rest as the example has it: `LINKSINK_HOST=localhost`, `LINKSINK_LISTEN=127.0.0.1`
(only this computer can reach it), `LINKSINK_HTTP_PORT=8080` (port 80 is Apache's) and
`LINKSINK_MAIL_TRANSPORT=console` (mail is printed, not sent).

## 2. Build and start

```bash
docker compose up -d --build
```

The first build takes about three minutes. The command returns once the app answers. Then open
**https://localhost** in your browser.

`docker compose ps` shows both containers; `docker compose logs app` shows the app's log.

**If it does not start:** `docker compose up` ends with `dependency failed to start: container linksink-app-1 is
unhealthy`, and `docker compose logs app` says why, in the app's own names for the settings:

- `BETTER_AUTH_SECRET must be at least 32 characters`: `LINKSINK_AUTH_SECRET` in `.env` is empty or short.
- `RESEND_API_KEY must be set` or `MAIL_FROM must be set`: set `LINKSINK_MAIL_TRANSPORT=console` (this machine),
  or the two Resend settings (a server).
- `ORIGIN must be the public origin`: `LINKSINK_HOST` holds more than a host name (no `https://`, no `/`).

If it ends with `ports are not available: exposing port TCP 127.0.0.1:8080` (or `:443`), something else holds that
port: pick another `LINKSINK_HTTP_PORT`, or free 443.

Fix `.env`, then run `docker compose up -d` again.

## 3. Sign up, and find the confirm link

Sign up at https://localhost/signup. With `LINKSINK_MAIL_TRANSPORT=console`, the confirmation mail is not sent: it is
printed in the app's log. Find the link with:

```bash
docker compose logs app | grep verify-email
```

Open that link in the same browser, then sign in. The same goes for a password reset link. LinkSink has one
account: once yours exists, sign-up closes.

## 4. The certificate warning

For `localhost`, Caddy makes its own certificate, signed by a local authority it creates. Your browser does not
know that authority, so the first visit shows a warning ("Your connection is not private"). Choose Advanced, then
Proceed to localhost. That is expected here, and only here: on a real host name Caddy gets a public certificate.

**Optional: trust Caddy's authority on Windows,** so the warning goes away. This adds one certificate to your
Windows user's trusted roots; Windows asks you to confirm.

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt /tmp/caddy-root.crt
certutil.exe -user -addstore Root "$(wslpath -w /tmp/caddy-root.crt)"
```

Restart the browser. Chrome and Edge read the Windows store; Firefox does too when `security.enterprise_roots.enabled`
is `true` in `about:config`. To remove it later:

```bash
certutil.exe -user -delstore Root "Caddy Local Authority - 2026 ECC Root"
```

The authority lives in the `caddy_data` volume. After a wipe (section 6), Caddy makes a new one, and you trust that
one instead.

## 5. Stop, and start again

```bash
docker compose stop      # stops both containers; your data stays
docker compose start     # starts them again
docker compose down      # removes the containers too; your data still stays (it is in the volumes)
docker compose up -d     # back up after a down
```

If the app is still fetching page details for many links (right after a big import), `stop` waits a few seconds
and then ends it. Nothing is lost: links still waiting are fetched again when it starts.

## 6. Wipe everything

This deletes your LinkSink account, every saved link and Caddy's certificates, for good:

```bash
docker compose down -v
```

The built image stays (`docker image ls`); `docker image rm linksink-app` removes it too.

## What is where

| Thing                    | Where                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| Settings                 | `.env` beside `compose.yaml` (example: `deploy/env.example`)          |
| Database and page images | volume `data`, at `/data` in the app (`linksink.db`, `media/`)        |
| Certificates             | volume `caddy_data`                                                   |
| HTTPS, redirects, HSTS   | `deploy/Caddyfile`                                                    |
| The app image            | `Dockerfile`; Node 22, runs as the user `node`, never root            |
| The app's port (3000)    | the compose network only; nothing outside Docker reaches it but Caddy |
