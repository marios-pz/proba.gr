CREATE TABLE "site_stat" (
	"key" text PRIMARY KEY NOT NULL,
	"n" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
-- Ads that already expired are gone, so "posted" can only start from what
-- is published right now.
insert into site_stat (key, n) values
  ('visits', 0),
  ('ads_posted', (select count(*) from ad where status = 'published'));
