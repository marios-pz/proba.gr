# API

Every write in this app is a SvelteKit **form action**, not a REST endpoint.
That is deliberate: form actions work without JavaScript, SvelteKit's
`use:enhance` upgrades them to `fetch` when it is available, and the
same-origin check comes free. Only two things are real JSON endpoints, and
both exist because the page needs data without a navigation.

So this file has three parts: the JSON endpoints, the form actions, and the
SQL functions underneath both, which are where the rules actually live.

| Surface                                      | Route                          | Method                  |
| -------------------------------------------- | ------------------------------ | ----------------------- |
| [Live ads in a country](#get-apiads)         | `/api/ads`                     | `GET`                   |
| [Record an ad view](#post-apiadsidview)      | `/api/ads/{id}/view`           | `POST`                  |
| [Report an ad](#post-apiadsidreport)         | `/api/ads/{id}/report`         | `POST`                  |
| [Legacy results redirect](#get-results)      | `/results`                     | `GET`                   |
| [Create or edit an ad](#post-post)           | `/post`                        | `POST` (default action) |
| [Confirm an email](#post-verify)             | `/verify`                      | `POST` (default action) |
| [Manage with a token](#post-manage)          | `/manage?/renew\|fill\|delete` | `POST`                  |
| [Renew from an email link](#post-renewnudge) | `/renew?/nudge`                | `POST`                  |

There is no authentication header, no session and no account anywhere in
this list. An ad belongs to whoever holds its edit token, and the token is
the only credential that exists.

---

## JSON endpoints

### `GET /api/ads`

Every live ad in one country, unranked and unfiltered. Ranking happens in the
browser (see [Ranking](#ranking-is-not-the-servers-job)).

**Query parameters**

| Name | Required | Description                                        |
| ---- | -------- | -------------------------------------------------- |
| `c`  | yes      | ISO 3166-1 alpha-2 country code, case-insensitive. |

**Responses**

`200` an array of `AdRow` (`src/lib/types.ts`):

```jsonc
[
	{
		"public_id": "k3f9qa", // the ad's public handle, 6 chars
		"band_name": "Rust Verdict",
		"blurb": "Rehearsal twice a week, gigs by spring.",
		"country_code": "GR",
		"display_lat": 37.9812, // jittered, NOT the real position
		"display_lng": 23.7301,
		"commitment": "serious", // casual | serious | professional
		"kind": "member", // member | gig | rehearsal
		"event_at": null, // ISO instant; null when kind is "member"
		"paid": false,
		"days_left": 11,
		"view_count": 42,
		"needs": ["drums", "bass"], // open roles only, filled ones drop out
		"genres": ["doom-stoner", "prog"],
		"links": [{ "kind": "instagram", "handle": "https://instagram.com/..." }],
	},
]
```

`400` `bad country code`, when `c` is missing or not two letters.

**What is deliberately not here:** `lat`, `lng`, `address`, `contact_email`,
and every token hash. Those columns exist on `ad` and never leave the
server. `display_lat`/`display_lng` are the real position pushed up to 700m
in a random direction by `jitter_position()`.

```bash
curl 'http://localhost:5173/api/ads?c=GR'
```

### `POST /api/ads/{id}/view`

Records that a visitor opened an ad's full detail. The browser fires this
once per ad per page load; the real deduplication is server-side.

**Path parameters**

| Name | Description           |
| ---- | --------------------- |
| `id` | The ad's `public_id`. |

No body. The viewer is identified by `sha256(IP_SALT + ':' + client IP)`,
never by the raw address, and never by a client-supplied number.

**Responses**

`200` `{ "view_count": 43 }`, the count after this call. Repeat views from
the same hashed viewer inside the 30-minute window return the unchanged
count rather than an error.

`404` `not found`, for an id that does not exist **or** is no longer live.
The two are indistinguishable on purpose.

```bash
curl -X POST 'http://localhost:5173/api/ads/k3f9qa/view'
```

### `POST /api/ads/{id}/report`

The red flag on an ad card. No token and no account: reporting has to work
for the person who just found the ad, which is everybody.

**Path parameters**

| Name | Description           |
| ---- | --------------------- |
| `id` | The ad's `public_id`. |

**Body** (`application/json`)

| Field    | Required | Notes                                                                                                                                                                         |
| -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reason` | yes      | One of `spam`, `impersonation`, `offensive`, `stale`, `other`. Must match the `reason_known` check on the table; the list lives in `src/lib/taxonomy.ts` as `REPORT_REASONS`. |
| `detail` | no       | Free text, trimmed and truncated to 600 characters.                                                                                                                           |

**Responses**

`202` `{ "ok": true }` for a live ad, a repeat click, **and** an id that
does not exist. All three are identical from outside, for the same reason
the token endpoints are vague: a 404 here would be a way to test which
`public_id`s are real.

`400` `unknown reason`, the only thing that fails loudly. A client sending
a reason outside the list is a bug, not a probe.

**Deduplication.** One report per `(ad, hashed reporter)` per 24 hours,
through `rate_bucket`, the same mechanism as view counting. A repeat click
returns 202, writes no row, and sends no email, so nobody can bury an ad by
mashing the flag or flood the admin inbox.

**The email.** A newly recorded report emails `ADMIN_EMAIL` with the band
name, reason, ad code, a link, and the detail text. If `ADMIN_EMAIL` is
unset or the send fails, the report is still committed and a warning goes
to the log: losing the notification is annoying, losing the report because
the notification failed would be worse.

```bash
curl -X POST 'http://localhost:3000/api/ads/k3f9qa/report' \
  -H 'content-type: application/json' \
  -d '{"reason":"impersonation","detail":"this is not their instagram"}'
```

### `GET /results`

`301` to `/?c=…&i=…&g=…&m=…`. `/results` was folded into `/` when the
region step went away; this keeps old shared links working by translating
them (it drops the dead `r` parameter) rather than breaking them.

---

## Form actions

These are `POST` endpoints that take `application/x-www-form-urlencoded` or
`multipart/form-data`, not JSON. SvelteKit returns either the action's own
data or a `fail()` payload, and the page re-renders with it in `form`. A
`fail()` always echoes the submitted values back so the form redraws filled
in rather than blank.

### `POST /post`

Creates an ad in `unverified` status and emails a confirm link. Nothing is
on the board until that link is clicked.

**Fields**

| Field                | Required | Notes                                                                                                                                                                                                                                                    |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `band_name`          | yes      | 1 to 80 characters after trimming.                                                                                                                                                                                                                       |
| `blurb`              | no       | Truncated to 600 characters.                                                                                                                                                                                                                             |
| `kind`               | yes      | `member`, `gig` or `rehearsal`. Defaults to `member`.                                                                                                                                                                                                    |
| `event_at`           | if dated | Full ISO instant. Required when `kind` is not `member`, must be in the future. The browser converts its `datetime-local` input using the poster's own timezone, because parsing a bare `2026-09-10T19:00` on the server would silently use the server's. |
| `country`            | yes      | ISO alpha-2.                                                                                                                                                                                                                                             |
| `pin_lat`, `pin_lng` | yes      | Where the rehearsal room actually is. Stored exactly, served jittered.                                                                                                                                                                                   |
| `address`            | no       | Street address. Never sent to a browser.                                                                                                                                                                                                                 |
| `instrument`         | yes      | Repeated field, one per open role. At least one. Unknown slugs are dropped silently.                                                                                                                                                                     |
| `genre`              | no       | Repeated field. Unknown slugs dropped.                                                                                                                                                                                                                   |
| `commitment`         | yes      | `casual`, `serious` or `professional`.                                                                                                                                                                                                                   |
| `paid`               | no       | `on` when checked, absent otherwise.                                                                                                                                                                                                                     |
| `social_kind`        | yes      | Repeated. Index-aligned with `social_url`. At least one pair must survive cleaning.                                                                                                                                                                      |
| `social_url`         | yes      | Repeated, index-aligned with `social_kind`.                                                                                                                                                                                                              |
| `email`              | yes      | Never public. Used for the confirm link, the token email and the day-11 nudge.                                                                                                                                                                           |

Valid slugs for `instrument`, `genre`, `commitment`, `kind` and
`social_kind` come from `src/lib/taxonomy.ts`, which is the same list the
database seeds from.

**Responses**

`{ posted: true, bandName, email }` on success. The ad row exists, is
`unverified`, and holds `verify_token_hash` with a 24-hour expiry. **No edit
token exists yet.**

`fail(400, { error, ...values })` for any validation failure. One message at
a time, in field order.

`fail(500, { error, ...values })` if the insert or the email send throws. A
failed email is reported honestly rather than leaving someone with an ad
they cannot confirm.

### `POST /verify`

The confirm-link click. This is what publishes the ad and mints the edit
token.

| Field   | Notes                                        |
| ------- | -------------------------------------------- |
| `id`    | The ad's `public_id`, from the emailed link. |
| `token` | The verify token, from the same link.        |

A real `POST` behind a button, never verification on the `GET` that loads
the page: mail security scanners routinely pre-visit links to check them,
which would otherwise burn a one-time token before the recipient ever
clicked it.

**Responses**

`{ verified: true, bandName }`. The ad is now `published`, the verify token
is cleared, a fresh edit token has been minted, hashed into
`edit_token_hash`, and emailed. The plaintext token exists only in that one
email and is never stored or shown on the site.

`fail(400, { error: 'This link is invalid or has expired.' })` for a wrong,
missing, already-used or expired token. All four look identical.

`fail(500, { error })` if the ad verified but the token email failed, which
is stated plainly because that person now has a live ad they cannot edit.

### `POST /manage`

Everything the owner can do. The token email links to
`/manage?id=<public_id>&token=<edit token>`; every action posts both again
as `id` and `token` and re-checks them.

| Action     | Extra field  | Does                                         | Success             |
| ---------- | ------------ | -------------------------------------------- | ------------------- |
| `?/renew`  |              | `ping_ad`: 14 more days from today           | `{ renewed: true }` |
| `?/fill`   | `instrument` | `close_role`: that instrument leaves `needs` | `{ filled: true }`  |
| `?/delete` | `band_name`  | `delete_ad`: the row and its children go     | `{ deleted: true }` |

A wrong pair is `fail(400, { error })` with the same sentence for "wrong
token" and "no such ad", because distinguishing them would let someone walk
the `public_id` space to discover which ads exist.

Editing is the `/post` form itself: `/post?edit=<public_id>&token=<token>`
loads it filled in, and it posts `edit_id` + `edit_token` with the usual
fields. The contact email can't be changed, and the public pin is only
re-jittered when the real one moved, so repeated saves can't be averaged
back to the address.

**Pings do not stack.** `ping_ad` sets
`greatest(expires_at, now() + interval '14 days')`, so an ad cannot be
pushed out half a year by pinging it repeatedly on the day it was posted.

### `POST /renew?/nudge`

The one-click link in the day-11 reminder email.

| Field   | Notes                                       |
| ------- | ------------------------------------------- |
| `id`    | The ad's `public_id`.                       |
| `nudge` | The single-use nudge token, valid 48 hours. |

Same success and failure shapes as `?/ping`.

This uses its own token, **never** the edit token. The edit token is never
persisted in plaintext anywhere, including in a link minted days after the
fact, so the reminder gets a narrow-purpose token of its own rather than
smuggling the real one forward in time.

---

## The SQL layer

The endpoints above are thin. The rules that have to hold no matter what
calls them live in Postgres, so they hold for `psql` too.

### Views

| View                | What it is                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ad_live`           | Every ad that is `published` and not past `expires_at`. Expiry is a **predicate, not a cron job**, so an expired ad cannot be served even in the window before `reap_expired_ads()` deletes the row. |
| `ad_needs_reminder` | Published ads 3 days or less from expiry that have not been reminded yet. Read by `scripts/send-reminders.js`.                                                                                       |

### Functions

| Function                                                                         | Returns                 | Notes                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ping_ad(public_id, token)`                                                      | `timestamptz` or `null` | Non-stacking 14-day extension. Null for a bad token and a missing ad alike.                                                                                             |
| `verify_ad(public_id, verify_token)`                                             | `boolean`               | Publishes the ad and clears the verify token.                                                                                                                           |
| `renew_via_nudge(public_id, nudge_token)`                                        | `timestamptz` or `null` | Single-use, consumes the token.                                                                                                                                         |
| `record_ad_view(public_id, viewer_hash, window default '30 minutes')`            | `integer` or `null`     | Increments at most once per viewer per window.                                                                                                                          |
| `report_ad(public_id, reason, detail, reporter_hash, window default '24 hours')` | `text` or `null`        | Band name when newly recorded, `''` when this reporter already flagged it, `null` when not live. The caller emails only on a band name.                                 |
| `close_role(public_id, token, instrument)`                                       | `boolean`               | Marks one open role filled. **No route calls this yet.**                                                                                                                |
| `delete_ad(public_id, token)`                                                    | `boolean`               | Token-gated takedown. **No route calls this yet.**                                                                                                                      |
| `reap_expired_ads(grace default '24 hours')`                                     | `integer`               | Hard-deletes ads more than `grace` past expiry, cascading to roles, genres, links and reports. Called on every boot by `bootstrap.js` and again by `send-reminders.js`. |
| `jitter_position(lat, lng, metres)`                                              | `record`                | The 700m push behind `display_lat`/`display_lng`.                                                                                                                       |

Every token-gated function returns `null` or `false` for both a wrong token
and a missing ad. That is the single most important convention here: it is
what stops the public API from being an ad enumerator.

---

## Conventions

### Field names are snake_case

JSON responses use the column names Postgres returns. There is no camelCase
mapping layer, because one would add a file to maintain and buy nothing.

### Ranking is not the server's job

`GET /api/ads` returns everything live in a country. The browser scores it:
instrument match 46, each genre overlap 20, commitment match 15, and a
distance term that peaks at 24 and halves every 50km. Nothing is ever
hidden.

Hard server-side filters produce empty pages, and an empty page on a first
visit is what kills a board before its network exists. The distance term
drops out entirely when geolocation is denied, so the board stays fully
usable. Coordinates from the visitor's own device are never sent to the
server and never put in a URL.

### Errors are deliberately vague

Anything token-related answers the same way whether the token was wrong, the
ad never existed, or it expired an hour ago. This is not sloppiness, it is
the only thing preventing enumeration in a system with no accounts.

### Rate limiting

`rate_bucket` backs the per-viewer view window and the per-reporter report
window. `POST /post` still has no rate limit. With no accounts, that table
and `report` are the only levers against abuse that exist.

---

## Not built yet

These are named here so nobody goes looking for a route that does not exist.

- **Role closing and ad deletion.** `close_role()` and `delete_ad()` work in
  SQL. No HTTP surface reaches them.
- **Scheduling for the reminder email.** `scripts/send-reminders.js` needs a
  cron entry, a systemd timer, or a platform scheduler. Once a day is plenty;
  the reminder window is 3 days wide. Reaping no longer waits on this: it
  runs at boot and again inside that same job.
- **Rate limiting on writes.** See above.
