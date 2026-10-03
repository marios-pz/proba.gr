-- ad_live is `select a.*`, expanded to a fixed column list (including
-- region_code) the last time it was created/replaced (0008), so it holds
-- a real dependency on that column — same lesson as 0006/0008 in reverse:
-- drop the view first, drop the column, then recreate the view so it
-- re-expands without it.
DROP VIEW "ad_live";--> statement-breakpoint
ALTER TABLE "region" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "region" CASCADE;--> statement-breakpoint
DROP INDEX "ad_country_idx";--> statement-breakpoint
CREATE INDEX "ad_country_idx" ON "ad" USING btree ("country_code","expires_at");--> statement-breakpoint
ALTER TABLE "ad" DROP COLUMN "region_code";--> statement-breakpoint
ALTER TABLE "country" DROP COLUMN "has_geo";--> statement-breakpoint
create or replace view ad_live as
select a.*
from ad a
where a.status = 'published' and a.expires_at > now();