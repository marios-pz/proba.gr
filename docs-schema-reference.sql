-- =====================================================================
--  find-a-band, Postgres schema
--
--  No users, no auth. An ad is owned by whoever holds its edit token.
--  Contact happens off-platform via the links on the ad.
--
--  psql "$DATABASE_URL" -f schema.sql
-- =====================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid, digest
create extension if not exists citext;        -- case-insensitive email
create extension if not exists cube;
create extension if not exists earthdistance; -- ll_to_earth / earth_distance
create extension if not exists pg_trgm;       -- fuzzy city + band search


-- ---------------------------------------------------------------------
-- Reference data. Lookup tables, not enums: you will add instruments and
-- genres constantly, and ALTER TYPE inside a transaction is a nuisance.
-- Slugs are the API contract; labels are display only.
-- ---------------------------------------------------------------------

create table country (
  code        char(2) primary key,            -- ISO 3166-1 alpha-2
  name_en     text    not null
);

create table city (
  id           bigint  primary key,           -- geonameid, so re-imports are idempotent
  country_code char(2) not null references country(code),
  name         text    not null,              -- local script: Θεσσαλονίκη
  name_ascii   text    not null,              -- Thessaloniki
  admin1       text,
  lat          double precision not null,
  lng          double precision not null,
  population   integer not null default 0
);
create index city_country_idx on city (country_code, population desc);
create index city_ascii_trgm  on city using gin (name_ascii gin_trgm_ops);
create index city_name_trgm   on city using gin (name gin_trgm_ops);
create index city_earth_idx   on city using gist (ll_to_earth(lat, lng));

create table instrument (
  slug     text primary key,                  -- 'drums', 'rhythm-guitar'
  label_en text not null,
  sort     smallint not null default 0
);

create table genre (
  slug     text primary key,
  label_en text not null,
  sort     smallint not null default 0
);


-- ---------------------------------------------------------------------
-- The ad. This is the whole product: a standing "musicians wanted" post.
-- ---------------------------------------------------------------------

create type ad_status  as enum ('unverified','published','expired','hidden','removed');
create type commitment as enum ('casual','serious','professional');

create table ad (
  id            uuid primary key default gen_random_uuid(),
  public_id     text not null unique,         -- short URL slug, e.g. 'k3f9qa'
  band_name     text not null check (length(btrim(band_name)) between 1 and 80),
  blurb         text not null check (length(blurb) <= 600),
  commitment    commitment not null,
  paid          boolean not null default false,

  -- Location. Country is how people search (ranked further by distance
  -- from the searching musician's own geolocation, never a hard filter);
  -- the pin is how they judge whether they can actually get to a rehearsal.
  country_code  char(2) not null references country(code),
  city_id       bigint references city(id),

  -- Exact position of the rehearsal room, as dropped on the map. Private.
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  address       text,                         -- optional, never public

  -- What the public map shows. Offset by up to ~700m at insert time, so a
  -- band can be found without publishing the address of a room full of
  -- gear to anyone with a browser. Airbnb does the same thing.
  display_lat   double precision not null,
  display_lng   double precision not null,
  show_exact    boolean not null default false,

  -- Never rendered to the public. Used for: verification, the edit link,
  -- the renewal reminder, and forwarding applications. Without accounts
  -- this is the only proof there is a real person behind the ad.
  contact_email citext not null,

  status        ad_status not null default 'unverified',
  verified_at   timestamptz,
  published_at  timestamptz,

  -- Ads expire after 14 days and are then DELETED, not archived. A board
  -- of dead bands is worse than the stories this replaces: the ad still
  -- looks live, the musician writes, nobody answers. Short and ruthless
  -- means everything on the board is real. Renewal is one click by email.
  expires_at    timestamptz not null default now() + interval '14 days',
  renewed_count integer not null default 0,
  reminded_at   timestamptz,                 -- renewal nudge, sent on day 11

  -- Ownership without accounts: SHA-256 of a 32-byte random token that is
  -- shown once and emailed once. Store the hash so a database leak does
  -- not hand out edit rights to every ad.
  edit_token_hash bytea not null,

  created_ip_hash bytea,                      -- HMAC(ip, server secret), never raw
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint published_implies_verified
    check (status <> 'published' or verified_at is not null)
);

create index ad_country_idx on ad (country_code, expires_at desc) where status = 'published';
create index ad_earth_idx   on ad using gist (ll_to_earth(display_lat, display_lng)) where status = 'published';
create index ad_name_trgm   on ad using gin (band_name gin_trgm_ops);
create index ad_expiry_idx  on ad (expires_at) where status = 'published';


-- Open positions. One ad routinely needs a drummer AND a bassist, and
-- fills them at different times, so this is a table, not a column.
create table ad_role (
  ad_id      uuid not null references ad(id) on delete cascade,
  instrument text not null references instrument(slug),
  filled_at  timestamptz,                     -- null = still open
  primary key (ad_id, instrument)
);
create index ad_role_open_idx on ad_role (instrument) where filled_at is null;

create table ad_genre (
  ad_id uuid not null references ad(id) on delete cascade,
  genre text not null references genre(slug),
  primary key (ad_id, genre)
);
create index ad_genre_genre_idx on ad_genre (genre);


-- Public contact links, the actual point of the product. The musician
-- finds the ad here and messages the band wherever the band already is.
create type link_kind as enum
  ('instagram','facebook','youtube','tiktok','spotify','bandcamp','soundcloud','website','email');

create table ad_link (
  ad_id  uuid not null references ad(id) on delete cascade,
  kind   link_kind not null,
  handle text not null,                       -- '@rustverdict' or a full URL
  primary key (ad_id, kind, handle)
);


-- ---------------------------------------------------------------------
-- Applications. Optional per ad: some bands only want DMs.
-- Answers are fixed-choice by design: no CVs, no free-text essays.
-- ---------------------------------------------------------------------

create table application (
  id         uuid primary key default gen_random_uuid(),
  ad_id      uuid not null references ad(id) on delete cascade,
  instrument text not null references instrument(slug),
  experience text not null check (experience in ('lt2','2to5','5to10','gt10')),
  travel     text not null check (travel     in ('easy','weekends','hard')),
  gear       text not null check (gear       in ('gear','transport','both','neither')),
  sample_url text,                            -- one link, replaces the CV
  reply_to   citext not null,
  ip_hash    bytea,
  created_at timestamptz not null default now()
);
create index application_ad_idx on application (ad_id, created_at desc);

alter table ad add column accepts_applications boolean not null default true;


-- ---------------------------------------------------------------------
-- Abuse. With no accounts these are the only levers you have.
-- ---------------------------------------------------------------------

-- Fixed-window counter. Keyed on hashed IP + action, e.g. 'ad:9f3c…'.
create table rate_bucket (
  key          text primary key,
  hits         integer not null default 0,
  window_start timestamptz not null default now()
);

create table report (
  id         bigserial primary key,
  ad_id      uuid not null references ad(id) on delete cascade,
  reason     text not null check (reason in ('spam','impersonation','offensive','stale','other')),
  detail     text,
  ip_hash    bytea,
  created_at timestamptz not null default now()
);
create index report_ad_idx on report (ad_id);


-- ---------------------------------------------------------------------
-- Live view. Expiry is a predicate, not a cron job: an ad past its date
-- simply stops matching. A job is only needed to send renewal reminders.
-- ---------------------------------------------------------------------

create view ad_live as
select a.*,
       c.name       as city_name,
       c.name_ascii as city_name_ascii
from ad a
left join city c on c.id = a.city_id
where a.status = 'published'
  and a.expires_at > now();


-- ---------------------------------------------------------------------
-- The search query. Note it does NOT filter on instrument or genre.
-- Hard filters produce empty pages, and an empty page on your first
-- visit is the thing that kills retention before the network exists.
-- Everything is a weight; the caller pages through a ranked list.
--
--   $1 country_code   $2 instrument slugs[]   $3 genre slugs[]
--   $4 lat            $5 lng                  $6 commitment (nullable)
-- ---------------------------------------------------------------------

create or replace function search_ads(
  p_country    char(2),
  p_instrument text[],
  p_genre      text[],
  p_lat        double precision,
  p_lng        double precision,
  p_commitment commitment default null,
  p_limit      integer default 50,
  p_offset     integer default 0
)
returns table (
  public_id  text,
  band_name  text,
  blurb      text,
  city_name  text,
  lat        double precision,   -- display position, never the exact room
  lng        double precision,
  commitment commitment,
  paid       boolean,
  needs      text[],
  genres     text[],
  distance_km double precision,
  score      double precision
)
language sql stable as $$
  with base as (
    select a.*,
           array(select r.instrument from ad_role r
                  where r.ad_id = a.id and r.filled_at is null) as needs,
           array(select g.genre from ad_genre g where g.ad_id = a.id) as genres,
           case when p_lat is null then null
                else earth_distance(ll_to_earth(a.display_lat, a.display_lng),
                                    ll_to_earth(p_lat, p_lng)) / 1000.0
           end as distance_km
    from ad_live a
    where a.country_code = p_country
  )
  select b.public_id, b.band_name, b.blurb, b.city_name, b.display_lat, b.display_lng,
         b.commitment, b.paid, b.needs, b.genres, b.distance_km,
         (
           -- plays your instrument: the single strongest signal
           case when b.needs && p_instrument then 46 else 0 end
           -- genre overlap, additive
           + 20 * cardinality(
               array(select unnest(b.genres) intersect select unnest(p_genre)))
           -- distance: full marks nearby, decaying, never disqualifying
           + case when b.distance_km is null then 0
                  else greatest(0, 24 - b.distance_km / 9.0) end
           -- commitment: exact match best, one step away still worth something
           + case when p_commitment is null then 0
                  when b.commitment = p_commitment then 12
                  else 5 end
           -- freshness tiebreaker, so a live scene outranks a stale one
           + 6 * exp(-extract(epoch from now() - b.published_at) / 2592000.0)
         )::double precision as score
  from base b
  order by score desc, b.distance_km nulls last, b.published_at desc
  limit p_limit offset p_offset;
$$;


-- ---------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------

insert into instrument (slug, label_en, sort) values
  ('drums','Drums',10), ('bass','Bass',20), ('rhythm-guitar','Rhythm guitar',30),
  ('lead-guitar','Lead guitar',40), ('vocals','Vocals',50), ('keys','Keys',60),
  ('violin','Violin',70), ('sax','Sax',80), ('harmonica','Harmonica',90),
  ('other','Other',999)
on conflict do nothing;

insert into genre (slug, label_en, sort) values
  ('thrash','Thrash',10), ('death-metal','Death metal',20), ('black-metal','Black metal',30),
  ('heavy-metal','Heavy metal',40), ('doom-stoner','Doom / Stoner',50), ('hardcore','Hardcore',60),
  ('punk','Punk',70), ('grunge','Grunge',80), ('alt-rock','Alt rock',90), ('prog','Prog',100),
  ('classic-rock','Classic rock',110), ('blues-rock','Blues rock',120),
  ('post-rock','Post-rock',130), ('indie','Indie',140)
on conflict do nothing;


-- ---------------------------------------------------------------------
-- Reaping. The view already hides expired ads, so nothing user-facing
-- depends on this running on time: it only reclaims rows. Every child
-- table is ON DELETE CASCADE, so one statement clears the lot.
--
-- Run from a SvelteKit interval, or `select cron.schedule(...)` if you
-- have pg_cron. Grace period so a renewal click that lands an hour late
-- still works.
-- ---------------------------------------------------------------------

create or replace function reap_expired_ads(grace interval default '24 hours')
returns integer language plpgsql as $$
declare n integer;
begin
  with gone as (
    delete from ad
     where expires_at < now() - grace
    returning 1
  ) select count(*) into n from gone;
  return n;
end $$;

-- Ads that need a renewal nudge: 3 days out, not yet reminded.
create or replace view ad_needs_reminder as
select id, public_id, band_name, contact_email, expires_at
from ad
where status = 'published'
  and reminded_at is null
  and expires_at between now() and now() + interval '3 days';


-- ---------------------------------------------------------------------
-- Jitter. Called on insert to derive the public position from the exact
-- one. Uniform inside a ~700 m disc, deterministic per ad so the pin
-- does not wander between page loads.
-- ---------------------------------------------------------------------

create or replace function jitter_position(
  p_lat double precision, p_lng double precision, p_seed uuid,
  p_metres double precision default 700
) returns record language plpgsql immutable as $$
declare
  h   bigint := ('x' || substr(md5(p_seed::text), 1, 8))::bit(32)::bigint;
  ang double precision := (h % 36000) / 36000.0 * 2 * pi();
  rad double precision := sqrt(((h / 36000) % 10000) / 10000.0) * p_metres;
  out record;
begin
  select p_lat + (rad * cos(ang)) / 111320.0,
         p_lng + (rad * sin(ang)) / (111320.0 * cos(radians(p_lat)))
    into out;
  return out;
end $$;


-- ---------------------------------------------------------------------
-- Ping. The whole lifecycle in one call: prove you hold the token, and
-- the ad gets another 14 days. This is the only thing standing between
-- a live board and a graveyard, so it must be a single click from an
-- email or a single paste in the UI, nothing more.
--
-- Returns the new expiry, or null if the token is wrong. Constant-ish
-- work either way so it cannot be used to enumerate valid public_ids.
-- ---------------------------------------------------------------------

create or replace function ping_ad(p_public_id text, p_token text)
returns timestamptz language plpgsql as $$
declare
  v_hash bytea := digest(p_token, 'sha256');
  v_new  timestamptz;
begin
  update ad
     set expires_at    = greatest(now(), expires_at) + interval '14 days',
         renewed_count = renewed_count + 1,
         reminded_at   = null,
         updated_at    = now()
   where public_id       = p_public_id
     and edit_token_hash = v_hash
     and status in ('published','unverified')
  returning expires_at into v_new;

  return v_new;   -- null means wrong token or no such ad; caller says only that
end $$;

-- Same token, other lifecycle actions.
create or replace function close_role(p_public_id text, p_token text, p_instrument text)
returns boolean language plpgsql as $$
declare ok boolean;
begin
  update ad_role r set filled_at = now()
    from ad a
   where r.ad_id = a.id and a.public_id = p_public_id
     and a.edit_token_hash = digest(p_token, 'sha256')
     and r.instrument = p_instrument and r.filled_at is null;
  get diagnostics ok = row_count;
  return ok;
end $$;

create or replace function delete_ad(p_public_id text, p_token text)
returns boolean language plpgsql as $$
declare n integer;
begin
  delete from ad
   where public_id = p_public_id
     and edit_token_hash = digest(p_token, 'sha256');
  get diagnostics n = row_count;
  return n > 0;
end $$;
