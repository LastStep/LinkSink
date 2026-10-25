#!/bin/sh
# deploy/update.sh: brings LinkSink on this machine up to its published image (T-0029; deploy/SERVER.md).
#
# Run it in LinkSink's folder (compose.yaml, deploy/Caddyfile and .env), by hand or from the deploy job over SSH:
#   sh deploy/update.sh                                    # the image .env names (LINKSINK_IMAGE), else latest
#   sh deploy/update.sh ghcr.io/laststep/linksink:1.2.0    # that image, kept in .env as LINKSINK_IMAGE once it runs
#
# In order: it refuses console mail on a public host name; pulls; starts what changed (Caddy too when the Caddyfile
# changed) and waits until the app is healthy; checks that https://<LINKSINK_HOST>/login answers 200 on this
# machine; writes the image it named into .env; then removes the older LinkSink images no container uses. Any failure
# stops it with a non-zero exit, and .env keeps naming the image that ran before. It needs docker with compose, and
# curl. It never touches the data volumes.
set -eu
# The files it writes (.env's copy among them) are readable by this user alone.
umask 077

say() { printf 'update: %s\n' "$*"; }
fail() {
	printf 'update: %s\n' "$*" >&2
	exit 1
}

cd "$(dirname "$0")/.."
[ -f compose.yaml ] && [ -f deploy/Caddyfile ] || fail "compose.yaml and deploy/Caddyfile are not in $(pwd): run it in LinkSink's folder"
[ -f .env ] || fail "no .env in $(pwd): write the settings first (deploy/SERVER.md)"
command -v docker > /dev/null 2>&1 || fail "docker is not installed"
docker compose version > /dev/null 2>&1 || fail "docker compose is not installed (the compose plugin)"
command -v curl > /dev/null 2>&1 || fail "curl is not installed"

# A setting's value in .env: the last line that sets it, without surrounding quotes.
setting() {
	sed -n "s/^[[:space:]]*$1[[:space:]]*=//p" .env | tail -n 1 |
		sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\\(.*\\)'\$/\\1/"
}

# 1. The settings a server must not get wrong, checked before anything changes.
host=$(setting LINKSINK_HOST | tr '[:upper:]' '[:lower:]')
host=${host:-localhost}
listen=$(setting LINKSINK_LISTEN)
mail=$(setting LINKSINK_MAIL_TRANSPORT)
case "$host" in
	localhost | *.localhost | *.local | *.internal | *.home.arpa) public=no ;;
	*:*) public=no ;;
	*[!0-9.]*) public=yes ;;
	*) public=no ;;
esac
if [ "$public" = yes ] && [ "$mail" = console ]; then
	fail "LINKSINK_MAIL_TRANSPORT=console on $host, a public name: every sign-in and reset link would be printed to the log. Set LINKSINK_MAIL_TRANSPORT=resend with LINKSINK_RESEND_API_KEY and LINKSINK_MAIL_FROM in .env"
fi
if [ "$public" = yes ] && [ "$listen" = 127.0.0.1 ]; then
	say "warning: LINKSINK_LISTEN=127.0.0.1, so nothing outside this machine reaches $host, Let's Encrypt included"
fi

# 2. The image: the one named here, else the one .env names, else latest. Given to compose through the environment,
# which comes before .env; written into .env (step 5) only once it answers.
named=no
if [ $# -gt 0 ]; then
	named=yes
	image=$1
	# One line of plain characters: grep alone would pass a value of several lines when one of them matches.
	case "$image" in *'
'*) fail "not an image name: it holds a line break" ;;
	esac
	printf '%s\n' "$image" | grep -Eqx '[a-z0-9][a-z0-9._/:@-]*' || fail "not an image name: $image"
else
	image=$(setting LINKSINK_IMAGE)
	image=${image:-ghcr.io/laststep/linksink:latest}
fi
LINKSINK_IMAGE=$image
export LINKSINK_IMAGE

# 3. Pull, then start what changed. --no-build: a machine running the published image never builds it.
say "pulling $image"
docker compose pull
docker image inspect "$image" > /dev/null 2>&1 || fail "$image is not on this machine after the pull (a private image needs docker login ghcr.io: deploy/SERVER.md)"
docker compose up -d --no-build --pull never --wait --wait-timeout 180
# A changed Caddyfile reaches Caddy only in a new container: a copied-over file can be a new file the old one never sees.
if ! docker compose exec -T caddy cat /etc/caddy/Caddyfile | cmp -s - deploy/Caddyfile; then
	say "the Caddyfile changed: starting Caddy again"
	docker compose up -d --no-build --pull never --no-deps --force-recreate --wait --wait-timeout 60 caddy
fi

# 4. https://<host>/login on this machine: through the address Caddy listens on, so DNS plays no part.
case "$listen" in
	'' | 0.0.0.0) address=127.0.0.1 ;;
	:: | '[::]') address='[::1]' ;;
	*:*) address="[$listen]" ;;
	*) address=$listen ;;
esac
check=$(mktemp -d)
trap 'rm -rf "$check"' EXIT
if [ "$public" = no ]; then
	# Caddy's own authority signed the certificate: check it against that, not against nothing.
	for _ in $(seq 1 30); do
		docker compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > "$check/root.crt" 2> /dev/null && break
		sleep 1
	done
	set -- --cacert "$check/root.crt"
else
	set --
fi
case "$host" in
	*:*) url="https://[$host]/login" ;;
	*) url="https://$host/login" ;;
esac
code=000
for _ in $(seq 1 60); do
	code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$host:443:$address" "$@" "$url" 2> "$check/error") || true
	[ "$code" = 200 ] && break
	sleep 3
done
[ "$code" = 200 ] || fail "$url answered $code on this machine: $(cat "$check/error"). See: docker compose logs caddy app"
say "$url answers 200"

# 5. The image named here, kept in .env so a later `docker compose up -d` runs it too. Written back into the same
# file, so its owner and mode stay as they are.
if [ "$named" = yes ] && [ "$(setting LINKSINK_IMAGE)" != "$image" ]; then
	if grep -q '^LINKSINK_IMAGE=' .env; then
		sed "s|^LINKSINK_IMAGE=.*|LINKSINK_IMAGE=$image|" .env > .env.update
	else
		{
			cat .env
			printf '\n# The image LinkSink runs, written by deploy/update.sh.\nLINKSINK_IMAGE=%s\n' "$image"
		} > .env.update
	fi
	cat .env.update > .env
	rm -f .env.update
fi

# 6. The older LinkSink images, the ones no container uses (the running one stays).
source=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$image" 2> /dev/null || true)
if [ -n "$source" ] && [ "$source" != '<no value>' ]; then
	docker image prune -af --filter "label=org.opencontainers.image.source=$source" > /dev/null
fi

say "LinkSink runs $image at https://$host"
