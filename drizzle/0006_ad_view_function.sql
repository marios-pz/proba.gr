-- `select a.*` in a view expands to a fixed column list at CREATE time, not
-- at query time, so 0005's new ad.view_count column never reached ad_live
-- on its own. Recreating the view (same body as 0001_functions.sql) makes
-- Postgres re-expand the star against the table's current columns.
create or replace view ad_live as
select a.*
from ad a
where a.status = 'published' and a.expires_at > now();
--> statement-breakpoint

-- Custom migration: view counting, with abuse control.
--
-- A "view" is the click that opens an ad's full detail, counted here in
-- the database rather than trusted from whatever number a client posts.
-- rate_bucket already existed for exactly this ("fixed-window counter
-- keyed on hashed IP plus action", see CLAUDE.md) but had nothing using
-- it yet. A given (ad, hashed viewer) pair only bumps ad.view_count once
-- per window, no matter how many times that click is repeated inside it,
-- so refreshing the page or mashing the card does not inflate the count;
-- a real visit after the window has passed does, same as any ordinary
-- view counter.
create or replace function record_ad_view(
  p_public_id text, p_viewer_hash text, p_window interval default '30 minutes'
) returns integer language plpgsql as $fn$
declare
  v_key   text := 'view:' || p_public_id || ':' || p_viewer_hash;
  v_hits  integer;
  v_count integer;
begin
  -- Only a live ad can be viewed at all, so an expired or unverified
  -- public_id neither counts nor leaves a rate_bucket row behind.
  if not exists (select 1 from ad_live where public_id = p_public_id) then
    return null;
  end if;

  insert into rate_bucket (key, hits, window_start)
  values (v_key, 1, now())
  on conflict (key) do update
    set hits = case when rate_bucket.window_start < now() - p_window then 1
                     else rate_bucket.hits + 1 end,
        window_start = case when rate_bucket.window_start < now() - p_window then now()
                             else rate_bucket.window_start end
  returning hits into v_hits;

  if v_hits = 1 then
    update ad set view_count = view_count + 1
     where public_id = p_public_id
    returning view_count into v_count;
  else
    select view_count into v_count from ad where public_id = p_public_id;
  end if;

  return v_count;
end $fn$;
