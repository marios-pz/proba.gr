-- Same lesson as 0006: `select a.*` in a view expands to a fixed column
-- list at CREATE time, so 0007's new ad.kind/ad.event_at columns need the
-- view recreated to actually reach ad_live (and everything that queries
-- through it).
create or replace view ad_live as
select a.*
from ad a
where a.status = 'published' and a.expires_at > now();
