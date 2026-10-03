-- Reporting. The `report` table has existed since 0000 with nothing
-- writing to it; this is the function that does.
--
-- Same shape as record_ad_view(): public, no token, keyed on a hashed
-- reporter rather than a raw IP, and deduped through rate_bucket so one
-- person cannot bury an ad by clicking the flag fifty times. With no
-- accounts, this and the 14 day expiry are the only levers against abuse
-- that exist.
--
-- Returns:
--   null          no such live ad. Indistinguishable from a wrong id, same
--                 as everywhere else, so this cannot enumerate public_ids.
--   ''            already reported by this reporter inside the window.
--                 Accepted silently: the clicker gets the same answer
--                 either way and learns nothing about the first report.
--   <band name>   newly recorded. The caller emails the admin only in
--                 this case, so a repeat click cannot become a mail flood.
create or replace function report_ad(
  p_public_id     text,
  p_reason        text,
  p_detail        text,
  p_reporter_hash text,
  p_window        interval default '24 hours'
) returns text language plpgsql as $fn$
declare
  v_key     text := 'report:' || p_public_id || ':' || p_reporter_hash;
  v_hits    integer;
  v_ad_id   uuid;
  v_band    text;
begin
  select id, band_name into v_ad_id, v_band
    from ad_live where public_id = p_public_id;
  if not found then
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

  if v_hits > 1 then
    return '';
  end if;

  -- reason is constrained by the reason_known check on the table itself,
  -- so an unknown value raises here even if a caller skips validating.
  insert into report (ad_id, reason, detail, ip_hash)
  values (v_ad_id, p_reason, nullif(btrim(coalesce(p_detail, '')), ''),
          decode(p_reporter_hash, 'hex'));

  return v_band;
end $fn$;
