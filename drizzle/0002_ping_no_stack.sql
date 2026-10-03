-- Fix: the previous version stacked. greatest(now(), expires_at) + 14 days
-- meant a band could ping ten times on day one and buy half a year, which
-- defeats the whole reason the timer exists.
--
-- Correct reading of "ping": always at least 14 days from today, and never
-- shorten an ad that already runs longer than that.
create or replace function ping_ad(p_public_id text, p_token text)
returns timestamptz language plpgsql as $fn$
declare v_new timestamptz;
begin
  update ad
     set expires_at    = greatest(expires_at, now() + interval '14 days'),
         renewed_count = renewed_count + 1,
         reminded_at   = null,
         updated_at    = now()
   where public_id = p_public_id
     and edit_token_hash = digest(p_token, 'sha256')
     and status in ('published', 'unverified')
  returning expires_at into v_new;
  return v_new;
end $fn$;
