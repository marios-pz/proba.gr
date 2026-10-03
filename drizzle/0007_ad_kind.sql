CREATE TYPE "public"."ad_kind" AS ENUM('member', 'gig', 'rehearsal');--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "kind" "ad_kind" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "event_at_matches_kind" CHECK (("ad"."kind" = 'member') = ("ad"."event_at" is null));