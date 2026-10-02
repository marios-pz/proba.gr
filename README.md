# proba

Standing "musicians wanted" ads. A band posts what it is missing and where;
a musician filters by instrument and genre and contacts the band on the
socials it already uses. No accounts, no matching, no chat, no CVs.

The thing this replaces is the Instagram story: you had to already follow the
band, and be looking within 24 hours. Here the ad sits still and is searchable.
The counterweight is a hard 14 day life, so nothing on the board is stale.

## Tech stack

**Frontend** &nbsp;SvelteKit 2 on Svelte 5, runes only, no stores, TypeScript
throughout, `adapter-node` for the build output. Leaflet renders the map
against OpenStreetMap's keyless tile server, no API key and no separate
geocoding service. Styling is plain CSS variables in `app.css`, no framework.

**Backend** &nbsp;SvelteKit's own server routes (`+page.server.ts`,
`+server.ts`) are the whole backend, there is no separate API service.
`drizzle-orm` sits over the `postgres` (postgres.js) driver. The rules that
have to hold no matter what calls them, jitter, non-stacking ping, 14 day
expiry, token hashing, live as Postgres functions and views, not app code.

**Database** &nbsp;PostgreSQL 18, with `pgcrypto`, `citext`, `cube`,
`earthdistance` and `pg_trgm`. Schema-as-code through Drizzle
(`schema.ts` &rarr; `db:generate`); functions and views are hand-written SQL
in `drizzle/`. `scripts/bootstrap.js` is plain Node, no framework, and is
what actually applies migrations and seeds reference data before the server
is allowed to start.

**Build tooling** &nbsp;Vite 8, `svelte-check` for types (`npm run check`,
kept at zero errors and warnings). `@electric-sql/pglite` is installed but
currently unused, nothing references it yet.

**Deployment** &nbsp;A multi-stage `Dockerfile` (`node:24-alpine`, non-root)
and a `docker-compose.yml` that adds `postgres:18-alpine`, for a
self-contained local or production-like stack with one command.

## Architecture

Three layers: a SvelteKit webapp, a Postgres database that does most of the
work through functions and views, and build-time static data (just
`countries.json` now) that never touches a network call at request time.

```mermaid
graph TB
    subgraph Browser
        UI["Combobox / MapView"]
        Position["position.svelte.ts  geolocation, in-memory only"]
    end

    subgraph Webapp["SvelteKit webapp"]
        Home["/  map + list, ranked, one page"]
        Post["/post  create an ad"]
        Renew["/renew  extend or edit"]
        Api["/api/ads  country switch, no reload"]
        Queries["server/queries.ts"]
        Geo["server/geo.ts  jitter"]
        Token["server/token.ts  mint, hash, compare"]
    end

    subgraph Data["Static data, build time"]
        Countries["countries.json"]
    end

    subgraph DB["Postgres"]
        Ad[("ad, ad_role, ad_genre, ad_link")]
        Ref[("country, instrument, genre")]
        Views[["ad_live / ad_needs_reminder"]]
        Funcs{{"ping_ad / close_role / delete_ad / reap_expired_ads"}}
    end

    UI --> Home & Post & Renew & Api
    Position --> UI

    Home --> Queries & Countries
    Api --> Queries
    Post --> Token & Geo
    Renew --> Funcs

    Queries --> Views
    Views --> Ad
    Funcs --> Ad
    Post --> Ad
    Home --> Ref
```

### Webapp

SvelteKit with `adapter-node`, Svelte 5 runes throughout, no stores.

- `src/routes/` &nbsp;`/` (map + list, ranked, filters live beside it,
  no separate results page), `/post` (create), `/renew` (extend or edit by
  token), `/api/ads` (JSON, backs the country switch without a full
  navigation)
- `src/lib/components/` &nbsp;`Combobox.svelte` (the one picker, used for
  country, instruments, genres, commitment), `MapView.svelte` (Leaflet +
  OpenStreetMap tiles, fits to pins or to the searching musician's own
  geolocation, gates below a minimum zoom)
- `src/lib/server/` &nbsp;`queries.ts` (the only thing that reads `ad`),
  `geo.ts` (jitter, server-only), `token.ts` (mint, hash,
  constant-time compare), `db/` (Drizzle schema and the lazy connection)
- `src/lib/fuzzy.ts`, `src/lib/taxonomy.ts` &nbsp;shared scorer and the
  instrument/genre constants, kept out of the routes so form and results
  page cannot drift apart

### Database

Postgres, reached through `postgres` + Drizzle, but the invariants live in
SQL, not in application code, so they hold no matter what calls them.

- **Tables** &nbsp;`ad` (the whole product), `ad_role`, `ad_genre`,
  `ad_link` (one row per open position, per genre, per contact point),
  `report`, `rate_bucket` (doubles as view-count and generic rate-limit
  storage), and the lookup tables `country`, `instrument`, `genre`
- **Views** &nbsp;`ad_live` (expiry as a predicate, not a job),
  `ad_needs_reminder` (selects rows for the day-11 nudge; nothing sends it
  yet)
- **Functions** &nbsp;`ping_ad` (`greatest(expires_at, now() + 14 days)`,
  deliberately non-stacking), `close_role`, `delete_ad` (token-gated
  mutations, so the token is the only credential that exists),
  `reap_expired_ads` (run on every boot), `report_ad` (deduped per
  reporter, emails `ADMIN_EMAIL`), `jitter_position` (the
  700m push behind `display_lat`/`display_lng`)
- **Migrations** &nbsp;`drizzle/*.sql`, applied in filename order by
  `scripts/bootstrap.js`, each one hashed and immutable once it has run
  anywhere

### Deployment

`Dockerfile` is a three-stage build: install and `vite build` with full
devDependencies, install production dependencies only, then a minimal
runtime image (`node:24-alpine`, non-root) holding just the compiled
`build/`, `scripts/`, `drizzle/`, and the `src/lib/data/` JSON that
`bootstrap.js` still reads at runtime. `docker-compose.yml` adds
`postgres:18-alpine` alongside it for a self-contained local stack.

## Running it

```bash
cp .env.example .env      # set DATABASE_URL
npm install
npm run build
npm start
```

Both `npm start` and `npm run dev` go through the same three gates, in this
order: **unit tests**, then **migrations**, then the app.

```
npm test            unit tests, no database, ~150ms
npm run db:bootstrap  migrations and reference data
                    the server
```

The first two are npm `prestart` / `predev` hooks, so there is no way to
start the app around them, including inside the container. Nothing else
needs doing to a fresh Postgres.

## Formatting

`npm run format` (Prettier). `npm install` points `core.hooksPath` at
`.githooks/`, whose pre-commit hook formats the staged files and restages
them, so formatting is never its own commit. `git commit --no-verify` skips
it. `src/app.css`, `drizzle/` and `static/` are in `.prettierignore`: the
CSS is hand-set several declarations to a line, and the other two are not
ours to reformat.

## Tests

`npm test` runs the node built-in test runner over `test/*.test.ts`. No
framework, no config, no transpile step: Node 24 strips the types itself.

`npm run test:integration` is the other half, and it needs a database:
point `DATABASE_URL` at a throwaway Postgres and it runs
`scripts/bootstrap.js` against it for real. Without that variable the suite
skips itself, so it never blocks a start. It checks the things only a
server can answer: extensions created before the first migration, every
file in `drizzle/` applied, a second run changing nothing, an **edited
migration refusing to deploy**, and `ad_live` hiding an ad until it is
published and again once it expires.

The unit tests cover the parts where being wrong is expensive and quiet: the jitter
that hides a rehearsal room's real address (never past its radius, evenly
spread over the disc), the token minting and hashing, form parsing and the
taxonomy invariants (every instrument in exactly one family, artwork on
disk for each one). Anything that needs Postgres is not in here; that
belongs in its own job with a service container, not in the gate that runs
before every start.

## CI

`.github/workflows/ci.yml`, in order:

1. **test** - `npm ci`, `npm run check`, `npm test`
2. **integration** - the same suite as above against a `postgres:18-alpine`
   service container, empty, one per run
3. **image** - build, then Trivy for HIGH and CRITICAL with `--ignore-unfixed`,
   then push to `ghcr.io/<owner>/proba`

Nothing is pushed that has not been tested and scanned, and a pull request
runs every step except the push. Images carry the OCI labels (`revision`,
`source`, `version`, `created`, `title`, `licenses`), and the run summary
prints the digest, which is what you deploy: a tag can be moved, a digest
cannot.

## The database gate

`scripts/bootstrap.js` is the only thing standing between a deploy and a
half-migrated database serving traffic. It:

1. refuses to continue without `DATABASE_URL`, with a message saying so
2. creates the extensions the schema needs, before any migration runs
   (`citext` is used as a column type, so it cannot wait)
3. decides whether the database is **empty** or **populated** by counting
   tables in `public`, and says which out loud
4. applies every migration in `drizzle/` that has not run, each in its own
   transaction
5. loads reference data (instruments, genres, 194 countries), idempotently,
   so new entries arrive with the next deploy
6. reaps expired ads, so "deleted, not archived" is true of the table and
   not just of `ad_live`. Relaunching after months of downtime clears
   months of dead rows before a single request is served

Never seeds ads. A fresh database starts with an empty board, on purpose:
an empty board is honest, a board of fake bands is not.

If any step throws, it prints the failing migration and the Postgres error
and exits `1`. `npm start` stops there. The server never comes up against a
schema it does not understand, because a partly-migrated site fails per
request in ways that look like application bugs.

Two guards worth knowing about:

- **Immutable history.** Each applied migration's SHA-256 is stored. Editing
  a migration that has already run is refused, rather than silently skipped.
- **Advisory lock.** Two instances booting at once cannot both migrate.

```
$ npm start
  proba  database bootstrap
   extensions ok (pgcrypto, citext, cube, earthdistance, pg_trgm)
   database is empty, creating the schema from scratch
   applied 3 migrations: 0000_supreme_champions.sql, 0001_functions.sql, ...
   reference data: 10 instruments, 14 genres, 194 countries
   reaped 3 expired ads
   ready
```

```
$ npm start          # with a broken migration
   bootstrap failed, the server will not start
   migration 0003_broken.sql failed and was rolled back.
     column "oops" of relation "ad" contains null values
```

## No accounts

An ad belongs to whoever holds its edit token. The token is 20 random bytes,
shown once on screen, and the row stores only `sha256(token)`. It cannot be
recovered or reset, which is stated plainly on the screen that shows it.

The email on an ad is never public. It exists for the renewal link, which is
the escape hatch when the token is lost.

`ping_ad(public_id, token)` extends an ad by 14 days. It uses
`greatest(expires_at, now() + 14 days)`, so pings do not stack: an ad cannot
be pushed out half a year on the day it is posted. It returns `null` for both
a wrong token and a missing ad, so the endpoint cannot be used to discover
which `public_id`s exist.

## Location

Ads carry two positions. `lat/lng` is where the rehearsal room actually is,
with an optional street address, and neither is ever sent to a browser.
`display_lat/display_lng` is the same point pushed up to 700m in a random
direction, and that is what the map draws. A band should be findable without
publishing the location of a room full of gear.

## Maps

`MapView.svelte` renders a real [Leaflet](https://leafletjs.com) map: OSM's
own keyless tile server (`tile.openstreetmap.org`), with a CSS
`invert()+hue-rotate()` filter for the dark look, since OSM's tiles have no
dark render of their own and the free dark basemap CDNs (CARTO) now gate
theirs behind an API key. No key, no signup; the tradeoff is that OSM's tile
server is a shared community resource, not a paid CDN, so it's meant for
apps at this scale, not heavy production traffic. If that ever changes, the
tile URL is the only place the decision lives.

There used to be a per-country admin-1 region picker backed by hand-built
GeoJSON (`tools/build-geo.py`, one file per country). It only ever covered 4
countries and needed a Python run for every new one, so it's gone. Country
is the only geography a musician picks by hand now. `MapView.svelte` frames
itself on whatever pins it's given (`fitBounds`), or on the searching
musician's own `navigator.geolocation` position when there are none yet, or
on a generic world view when neither is available, with no per-country data file
of any kind. Below a minimum zoom the pin layer hides and both the map and
the list prompt to zoom in, the same idea as Airbnb's "search this area."

Posting an ad sends Leaflet's own click event straight through: real
lat/lng, no pixel-space projection involved, and the server only jitters
and stores it.

## Ranking, not filtering

`liveAds()` returns everything live in a country and the client ranks it:
instrument match 46, each genre overlap 20, distance from the searching
musician's own geolocation (a smooth falloff, halving every 50km, peaking
at 24, never a hard cutoff, and it drops out entirely if geolocation is
denied). Nothing is hidden. Hard filters produce empty pages, and an empty
page on a first visit is what kills a board before its network exists.

## Layout

```
scripts/bootstrap.js        the gate described above
scripts/seed-demo.js        five demo ads, by hand only, never on boot
drizzle/                    migrations, applied in filename order
src/lib/server/db/schema.ts Drizzle schema, the source of truth
src/lib/geo.ts              haversineKm, client-safe geo math
src/lib/server/geo.ts       jitter (server-only)
src/lib/position.svelte.ts  shared one-shot geolocation request
src/lib/server/token.ts     mint, hash, constant-time compare
src/lib/components/         Combobox, MapView (Leaflet + OpenStreetMap)
src/routes/                 / (map + list), /post, /renew, /api/ads
src/lib/types.ts            the shapes that cross the server/client line
src/lib/session.ts          sessionStorage drafts (filters, half-written ad)
src/lib/server/form.ts      FormData readers shared by every action
src/lib/data/               countries.json
```

Every endpoint and form action is documented in [API.md](API.md).

## Not built yet

- Email: verification, the renewal nudge on day 11, forwarding applications.
  `ad_needs_reminder` selects the rows; nothing sends them.
- Scheduling. `scripts/send-reminders.js` still needs a cron entry for the
  day-11 nudge. Expired ads are already reaped on every boot, and that same
  job reaps too, so the only thing waiting on a scheduler is the email.
- Moderation: reports arrive by email and nothing acts on them
  automatically. There is no admin UI, so taking an ad down is still
  `delete_ad(public_id, token)` or a `delete` in psql.
