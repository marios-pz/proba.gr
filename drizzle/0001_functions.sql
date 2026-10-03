-- Custom migration: the behaviour that belongs in the database rather than
-- the application. Ranking, jitter and the token-checked lifecycle calls.

create or replace function jitter_position(
  p_lat double precision, p_lng double precision, p_seed uuid,
  p_metres double precision default 700
) returns table (lat double precision, lng double precision)
language plpgsql immutable as $fn$
declare
  h   bigint := ('x' || substr(md5(p_seed::text), 1, 8))::bit(32)::bigint;
  ang double precision := (h % 36000) / 36000.0 * 2 * pi();
  rad double precision := sqrt(((h / 36000) % 10000) / 10000.0) * p_metres;
begin
  return query select
    p_lat + (rad * cos(ang)) / 111320.0,
    p_lng + (rad * sin(ang)) / (111320.0 * cos(radians(p_lat)));
end $fn$;
--> statement-breakpoint
-- Expiry is a predicate, not a job. An ad past its date simply stops
-- matching, so nothing user-facing depends on the reaper running on time.
create or replace view ad_live as
select a.*
from ad a
where a.status = 'published' and a.expires_at > now();
--> statement-breakpoint
create or replace function reap_expired_ads(grace interval default '24 hours')
returns integer language plpgsql as $fn$
declare n integer;
begin
  with gone as (delete from ad where expires_at < now() - grace returning 1)
  select count(*) into n from gone;
  return n;
end $fn$;
--> statement-breakpoint
create or replace view ad_needs_reminder as
select id, public_id, band_name, contact_email, expires_at
from ad
where status = 'published' and reminded_at is null
  and expires_at between now() and now() + interval '3 days';
--> statement-breakpoint
-- Ping: prove you hold the token, get another 14 days. greatest() means
-- pings do not stack, so an ad cannot be pushed out half a year on day one.
create or replace function ping_ad(p_public_id text, p_token text)
returns timestamptz language plpgsql as $fn$
declare v_new timestamptz;
begin
  update ad
     set expires_at    = greatest(now(), expires_at) + interval '14 days',
         renewed_count = renewed_count + 1,
         reminded_at   = null,
         updated_at    = now()
   where public_id = p_public_id
     and edit_token_hash = digest(p_token, 'sha256')
     and status in ('published', 'unverified')
  returning expires_at into v_new;
  return v_new;   -- null means wrong token or no such ad; the caller says only that
end $fn$;
--> statement-breakpoint
create or replace function close_role(p_public_id text, p_token text, p_instrument text)
returns boolean language plpgsql as $fn$
declare n integer;
begin
  update ad_role r set filled_at = now()
    from ad a
   where r.ad_id = a.id and a.public_id = p_public_id
     and a.edit_token_hash = digest(p_token, 'sha256')
     and r.instrument = p_instrument and r.filled_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $fn$;
--> statement-breakpoint
create or replace function delete_ad(p_public_id text, p_token text)
returns boolean language plpgsql as $fn$
declare n integer;
begin
  delete from ad
   where public_id = p_public_id and edit_token_hash = digest(p_token, 'sha256');
  get diagnostics n = row_count;
  return n > 0;
end $fn$;
