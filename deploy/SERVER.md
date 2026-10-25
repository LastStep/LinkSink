# Running LinkSink on another Docker machine

This is for running LinkSink somewhere other than the computer you develop on. That machine needs no source code
and builds nothing: it runs the image GitHub publishes, `ghcr.io/laststep/linksink`, from three small files. For
trying it on this computer, see `deploy/README.md` instead.

There are two cases, and the steps say where they differ:

- **A. A server with a domain**, e.g. a VPS reached at `links.example.com`. Caddy gets a real certificate from
  Let's Encrypt, mail is sent through Resend, and LinkSink answers on every address of the server.
- **B. Another machine on your home network, with no domain**, e.g. a spare PC or a NAS at `192.168.1.20`. Caddy
  makes its own certificate, so each browser warns once (or never, once you trust it), and mail can stay in the log.

## Once, on GitHub: make the image public

GitHub publishes the image each time `main` is pushed (the `ci` workflow, job `publish`). A new package on GitHub
starts private, even in a public repository, and a private image needs a login on every machine. Make it public
once, after the first publish:

1. Open https://github.com/LastStep?tab=packages and choose **linksink**.
2. **Package settings** (on the right), then at the bottom, **Change visibility**, **Public**, and type the name to
   confirm. This cannot be undone; the image holds nothing secret (no settings, no data).

To keep it private instead: make a GitHub token (classic) with only `read:packages`, and on each machine run
`docker login ghcr.io -u LastStep` once, giving the token as the password.

## What the machine needs

- **Linux on a 64-bit Intel or AMD processor** (amd64). The image is not built for ARM (a Raspberry Pi, an ARM VPS,
  an Apple Silicon Mac): there, copy the whole LinkSink folder instead and use `docker compose up -d --build`.
- **Docker Engine with the compose plugin**: `docker compose version` answers. On a fresh server:
  `curl -fsSL https://get.docker.com | sh`. Also `curl`, which most systems have.
- About 1 GB of free memory and 2 GB of disk.
- **Case A:** the domain's DNS record (A, and AAAA if the server has IPv6) pointing at the server, and ports 80 and
  443 open to the internet in every firewall in front of it (the cloud provider's too). Let's Encrypt checks the
  name through port 80.
- **Case B:** a fixed address on the home network (a DHCP reservation in your router), and ports 80 and 443 free on
  that machine.

## 1. Get the files

On the machine, in a folder of your choosing (here `~/linksink`):

```bash
mkdir -p ~/linksink/deploy && cd ~/linksink
base=https://raw.githubusercontent.com/LastStep/LinkSink/main
curl -fsSLo compose.yaml "$base/compose.yaml"
curl -fsSLo deploy/Caddyfile "$base/deploy/Caddyfile"
curl -fsSLo deploy/update.sh "$base/deploy/update.sh"
curl -fsSLo .env "$base/deploy/server.env.example"
chmod 600 .env
```

That is the whole install: `compose.yaml` names the image, `deploy/Caddyfile` is Caddy's setup, `deploy/update.sh`
updates it later, and `.env` holds the settings. Never use `deploy/env.example` on another machine: it is set up for
this computer only (console mail, port 8080, reachable from itself only).

## 2. Write the settings

Open `.env` (`nano .env`). Each setting has a comment above it.

| Setting                   | A. Server with a domain                               | B. Home network, no domain                                                                                                          |
| ------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `LINKSINK_HOST`           | the domain, e.g. `links.example.com`                  | the machine's address, e.g. `192.168.1.20`, or a local name such as `nas.local` (never a bare `nas`: Caddy would ask Let's Encrypt) |
| `LINKSINK_LISTEN`         | empty                                                 | empty                                                                                                                               |
| `LINKSINK_HTTP_PORT`      | `80`                                                  | `80`                                                                                                                                |
| `LINKSINK_AUTH_SECRET`    | `openssl rand -base64 32`, or the old machine's value | the same                                                                                                                            |
| `LINKSINK_MAIL_TRANSPORT` | empty (Resend)                                        | empty (Resend), or `console`                                                                                                        |
| `LINKSINK_RESEND_API_KEY` | your Resend API key                                   | the key, unless `console`                                                                                                           |
| `LINKSINK_MAIL_FROM`      | e.g. `LinkSink <mail@links.example.com>`              | the same, unless `console`                                                                                                          |

To fill in the secret in one go: `sed -i "s|^LINKSINK_AUTH_SECRET=.*|LINKSINK_AUTH_SECRET=$(openssl rand -base64 32)|" .env`.
If you will move your links from this computer (step 4), copy its `LINKSINK_AUTH_SECRET` instead.

**Mail.** Resend sends mail only from a domain you have verified in Resend (resend.com, Domains). `console` prints
each mail, sign-in and reset links included, to `docker compose logs app`, which anyone who can run Docker on that
machine can read. That is acceptable on a home machine only you use, and never on a server: `deploy/update.sh`
refuses to run with `console` on a public domain.

## 3. Start it

```bash
sh deploy/update.sh
```

It pulls the image, starts LinkSink, waits until it is healthy and checks that `https://<LINKSINK_HOST>/login`
answers. The first time takes a minute or two (the image is about 500 MB). It ends with
`update: LinkSink runs ghcr.io/laststep/linksink:latest at https://<your host>`. The plain commands do the same
without the checks: `docker compose pull`, then `docker compose up -d`.

Then open `https://<LINKSINK_HOST>` and sign up (once: LinkSink has one account, and sign-up closes after). With
`console` mail, find the confirm link with `docker compose logs app | grep verify-email`.

**Case B, the certificate warning.** Each browser warns on the first visit ("Your connection is not private").
Choose Advanced, then Proceed: LinkSink never tells a browser to refuse that for a local address, so you always can.
To stop the warning for good, trust Caddy's own authority on each device. Copy it out with
`docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt linksink-root.crt`, then on Windows run
`certutil -user -addstore Root linksink-root.crt`; on a Mac open it and set it to Always Trust in Keychain Access; on
a phone, install it as a CA certificate in the security settings (iPhone: then turn it on under General, About,
Certificate Trust Settings).

**If it does not start**, `docker compose logs app` and `docker compose logs caddy` say why; `deploy/README.md`
("If it does not start") lists the usual messages. For case A, Caddy's log shows the certificate request: a
`challenge failed` there means the domain does not point at this server yet, or port 80 is closed.

## 4. Move your links from this computer (optional)

Your account and links live in the Docker volume `linksink_data`. Copy it into a file, carry the file over, and
unpack it into the new machine's volume before LinkSink starts there for the first time.

On **this computer**, in the LinkSink folder:

```bash
docker compose stop app
docker run --rm -v linksink_data:/data:ro -v "$PWD":/backup alpine:3.22 tar -czf /backup/linksink-data.tar.gz -C /data .
docker compose start app
scp linksink-data.tar.gz <user>@<the other machine>:linksink/
```

On **the other machine**, in its LinkSink folder, after steps 1 and 2 (with this computer's `LINKSINK_AUTH_SECRET`)
and instead of step 3:

```bash
docker compose pull
docker compose create
docker run --rm -v linksink_data:/data -v "$PWD":/backup alpine:3.22 tar -xzf /backup/linksink-data.tar.gz -C /data
sh deploy/update.sh
```

`docker compose create` makes the empty volumes without starting anything; the next line fills `linksink_data`. Then
sign in with your usual email and password: every link, tag and project is there. Each device signs in again, since
the address changed. Delete `linksink-data.tar.gz` from both machines once it works: it holds your whole account.

If LinkSink already ran on the new machine, empty its volume first, which deletes what is in it:
`docker compose down -v`, then the four lines above.

## 5. Update it

```bash
cd ~/linksink && sh deploy/update.sh
```

This takes the newest published image (`latest`). To run a given version, name it:
`sh deploy/update.sh ghcr.io/laststep/linksink:sha-1a2b3c4` (each commit on `main` has one; a release tag `v1.2.0`
publishes `:1.2.0`). The script writes the name into `.env` as `LINKSINK_IMAGE`, so the machine stays on it until
the next update; empty that line to follow `latest` again. Older LinkSink images are removed once the new one
answers. To update `compose.yaml` and the Caddyfile too, fetch them again as in step 1 (not `.env`).

Your data stays in the volume through every update. `docker compose down -v` is the one command that deletes it.

## 6. Deploy from GitHub on every push (case A)

Once this is set up, each push to `main` that passes CI also updates the server: the `deploy` workflow signs in over
SSH, copies `compose.yaml`, the Caddyfile and `update.sh` into the server's folder, runs `deploy/update.sh` with that
commit's image, and checks `https://<domain>/login` from GitHub. Until the secrets below exist, it skips with a
notice ("Deploy skipped") and CI stays green. You can also run it by hand for any published tag: GitHub, Actions,
**deploy**, **Run workflow**, and type the tag (`latest`, `1.2.0` or `sha-1a2b3c4`).

1. **On the server**, as root: a user for deploys, allowed to run Docker, owning the LinkSink folder. Membership of
   the `docker` group is as good as root on that machine, so the key below is for this alone.

   ```bash
   adduser --disabled-password --gecos '' deploy
   usermod -aG docker deploy
   ```

   Then do steps 1 to 3 as that user (`su - deploy`), so the folder is `/home/deploy/linksink`.

2. **On your computer**: a key pair for GitHub, with no passphrase, and its public half on the server.

   ```bash
   ssh-keygen -t ed25519 -N '' -C linksink-deploy -f linksink-deploy
   ssh-copy-id -i linksink-deploy.pub deploy@links.example.com
   ssh-keyscan -t ed25519 links.example.com > linksink-known-hosts
   ```

   `ssh -i linksink-deploy deploy@links.example.com docker ps` should list LinkSink's two containers.

3. **On GitHub**: the repository, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**,
   once for each:

   | Name                 | Value                                                                           |
   | -------------------- | ------------------------------------------------------------------------------- |
   | `DEPLOY_HOST`        | the domain, the same as `LINKSINK_HOST`: `links.example.com`                    |
   | `DEPLOY_USER`        | `deploy`                                                                        |
   | `DEPLOY_SSH_KEY`     | the whole of the file `linksink-deploy` (the private key)                       |
   | `DEPLOY_PATH`        | the folder on the server: `/home/deploy/linksink`                               |
   | `DEPLOY_KNOWN_HOSTS` | the whole of the file `linksink-known-hosts`, so GitHub never trusts a stranger |
   | `DEPLOY_PORT`        | only if SSH is not on port 22                                                   |

   Then delete `linksink-deploy` from your computer, or keep it in your password manager.

To check it: GitHub, Actions, **deploy**, **Run workflow** with `latest`. The run's summary ends with
`Deployed latest to https://links.example.com`.

## 7. Check the address LinkSink sees (case A)

LinkSink limits sign-in attempts per visitor address, so it must see each visitor's own address, not one address
for everyone. Sign in from your phone over mobile data (not your home Wi-Fi), then on the server:

```bash
docker compose exec app node -e "const D=require('better-sqlite3'); for (const s of new D('/data/linksink.db',{readonly:true}).prepare('select ip_address, user_agent from session order by created_at desc limit 3').all()) console.log(s.ip_address, s.user_agent)"
```

The newest line should show your phone's public address (search "what is my IP" on the phone). If it shows an
address like `172.18.0.1` instead, Docker is hiding visitors' addresses, typically for visitors over IPv6 when
Docker's IPv6 is off: write that down for T-0020, and LinkSink still works meanwhile.

## What is where

| Thing                       | Where                                                                           |
| --------------------------- | ------------------------------------------------------------------------------- |
| Settings                    | `.env` in the LinkSink folder (example: `deploy/server.env.example`)            |
| The image it runs           | `LINKSINK_IMAGE` in `.env`; `ghcr.io/laststep/linksink:latest` when empty       |
| Account, links, page images | the volume `linksink_data`                                                      |
| Certificates                | the volume `linksink_caddy_data`                                                |
| Logs                        | `docker compose logs app`, `docker compose logs caddy`                          |
| Stop, start, remove         | `docker compose stop`, `start`, `down` (data stays); `down -v` deletes the data |

Backups of the volume (Litestream and restic) are not set up yet: that is T-0020. Until then, the file from step 4
is a backup: make one now and then the same way.
