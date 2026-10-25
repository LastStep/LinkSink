# syntax=docker/dockerfile:1
#
# LinkSink's app image (T-0005, ADR-0004). Built by `docker compose build`; deploy/README.md runs it.
#
# The image carries no public origin. Built without ORIGIN, adapter-node derives each request's origin from its
# Host header (protocol https), and compose passes ORIGIN at run time for Better Auth, so one image serves any host
# name behind Caddy.

# Node 22 on Debian slim (glibc): better-sqlite3, sharp and @node-rs/argon2 ship prebuilt binaries for it. Pinned by
# its digest (the multi-platform index), so CI and every machine build on the same base; the tag is for people.
ARG NODE_IMAGE=node:22.23.4-trixie-slim@sha256:8eb619e402eaede1748a3c8173bffab391592812e85136452f781741c7242ddf

# Compilers for a native module with no prebuilt binary for the platform (better-sqlite3 then builds from source).
FROM ${NODE_IMAGE} AS toolchain
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./

# Every dependency, then the build (vite build, adapter-node) into build/.
FROM toolchain AS build
RUN npm ci
COPY . .
RUN npm run build

# Production dependencies only: no drizzle-kit, vite or playwright. `--omit=dev` alone keeps what the lockfile marks
# devOptional: dev tools that are also optional peers of better-auth (@sveltejs/kit, svelte, vitest, drizzle-kit, and
# vite, esbuild, typescript under them). The build bundles better-auth, so the server never loads them: removed.
FROM toolchain AS deps
RUN npm ci --omit=dev \
	&& node -e "const { rmSync } = require('node:fs'); \
		for (const [path, entry] of Object.entries(require('./package-lock.json').packages)) \
			if (entry.devOptional) rmSync(path, { recursive: true, force: true });" \
	&& find node_modules/.bin -xtype l -delete \
	&& npm cache clean --force

# The image: the built server, production node_modules, package.json (type: module) and the migrations, which
# run from ./drizzle when the server starts.
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
	PORT=3000 \
	DATABASE_PATH=/data/linksink.db \
	BODY_SIZE_LIMIT=Infinity \
	SHUTDOWN_TIMEOUT=5
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY drizzle ./drizzle
# /data holds the database and media/ beside it. A new named volume mounted there takes this owner.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "build"]
