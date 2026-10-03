-- Counters outlive the thing they count. rate_bucket holds one row per
-- (ad, hashed viewer) and per (action, hashed reporter), and it has no
-- foreign key to ad, so deleting an ad never took them with it and the
-- table only ever grew. That also made the retention promise on /terms
-- false: the ad was gone, a hash of everyone who looked at it was not.
--
-- Reaping the ads and reaping the counters is the same job, so it is the
-- same function, run at every boot and by send-reminders.js daily.
create or replace function reap_expired_ads(grace interval default '24 hours')
returns integer language plpgsql as $fn$
declare n integer;
begin
  with gone as (delete from ad where expires_at < now() - grace returning 1)
  select count(*) into n from gone;

  -- A rate window is minutes or hours wide. A row untouched for 30 days
  -- cannot affect a decision any more, it is only a hash sitting there.
  delete from rate_bucket where window_start < now() - interval '30 days';

  return n;
end $fn$;
