-- Genres the fixed list doesn't have, typed by the poster (see schema.ts).
-- ad_live is `select a.*`, expanded to a fixed column list when it was
-- created, so it would never show the new column: drop it first and
-- recreate it after, same as 0009.
DROP VIEW "ad_live";--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "custom_genres" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "custom_genres_max" CHECK (cardinality("ad"."custom_genres") <= 3);--> statement-breakpoint
create or replace view ad_live as
select a.*
from ad a
where a.status = 'published' and a.expires_at > now();
