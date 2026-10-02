# syntax=docker/dockerfile:1

# Node 24 is the current Active LTS line. Alpine keeps the image minimal.
ARG NODE_VERSION=24-alpine

# ---- build: full deps, compile the SvelteKit app -------------------------
# `npm run build` must not need a database; it only runs vite.
FROM node:${NODE_VERSION} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm test
RUN npm run build

# ---- prod-deps: install only what runs in production ----------------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: minimal final image -----------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# adapter-node output, prod-only node_modules, and everything `npm start`
# needs. That is the unit tests, the db bootstrap gate and the immutable
# migrations, in that order: prestart runs the tests, bootstrap migrates,
# then the server comes up. bootstrap.js reads src/lib/data/*.json
# (countries, geo) at runtime, and the tests read the rest of src/lib, so
# the sources ship as well as the build.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY test ./test
COPY src/lib ./src/lib
COPY static/instruments ./static/instruments

# npm, corepack and yarn only come with the base image, and their bundled
# deps are where the scanner keeps finding CVEs. Nothing at runtime needs
# them: CMD below runs the `npm start` chain directly. apk upgrade picks up
# Alpine fixes the base image has not been rebuilt with yet.
RUN apk upgrade --no-cache && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
        /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ || exit 1

# Same as `npm start` (prestart test -> bootstrap -> server). exec makes the
# server PID 1, so SIGTERM from `docker stop` reaches it.
CMD ["sh", "-c", "node --test test/*.test.ts && node scripts/bootstrap.js && exec node build/index.js"]
