CREATE TYPE "public"."ad_status" AS ENUM('unverified', 'published', 'expired', 'hidden', 'removed');--> statement-breakpoint
CREATE TYPE "public"."commitment" AS ENUM('casual', 'serious', 'professional');--> statement-breakpoint
CREATE TYPE "public"."link_kind" AS ENUM('instagram', 'facebook', 'youtube', 'tiktok', 'spotify', 'bandcamp', 'soundcloud', 'website', 'email');--> statement-breakpoint
CREATE TABLE "ad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"band_name" text NOT NULL,
	"blurb" text DEFAULT '' NOT NULL,
	"commitment" "commitment" NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"country_code" char(2) NOT NULL,
	"region_code" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"address" text,
	"display_lat" double precision NOT NULL,
	"display_lng" double precision NOT NULL,
	"show_exact" boolean DEFAULT false NOT NULL,
	"contact_email" "citext" NOT NULL,
	"status" "ad_status" DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '14 days' NOT NULL,
	"renewed_count" integer DEFAULT 0 NOT NULL,
	"reminded_at" timestamp with time zone,
	"edit_token_hash" "bytea" NOT NULL,
	"accepts_applications" boolean DEFAULT true NOT NULL,
	"created_ip_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "band_name_len" CHECK (length(btrim("ad"."band_name")) between 1 and 80),
	CONSTRAINT "blurb_len" CHECK (length("ad"."blurb") <= 600),
	CONSTRAINT "lat_range" CHECK ("ad"."lat" between -90 and 90),
	CONSTRAINT "lng_range" CHECK ("ad"."lng" between -180 and 180),
	CONSTRAINT "published_implies_verified" CHECK ("ad"."status" <> 'published' or "ad"."verified_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "ad_genre" (
	"ad_id" uuid NOT NULL,
	"genre" text NOT NULL,
	CONSTRAINT "ad_genre_ad_id_genre_pk" PRIMARY KEY("ad_id","genre")
);
--> statement-breakpoint
CREATE TABLE "ad_link" (
	"ad_id" uuid NOT NULL,
	"kind" "link_kind" NOT NULL,
	"handle" text NOT NULL,
	CONSTRAINT "ad_link_ad_id_kind_handle_pk" PRIMARY KEY("ad_id","kind","handle")
);
--> statement-breakpoint
CREATE TABLE "ad_role" (
	"ad_id" uuid NOT NULL,
	"instrument" text NOT NULL,
	"filled_at" timestamp with time zone,
	CONSTRAINT "ad_role_ad_id_instrument_pk" PRIMARY KEY("ad_id","instrument")
);
--> statement-breakpoint
CREATE TABLE "country" (
	"code" char(2) PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"has_geo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genre" (
	"slug" text PRIMARY KEY NOT NULL,
	"label_en" text NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument" (
	"slug" text PRIMARY KEY NOT NULL,
	"label_en" text NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_bucket" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region" (
	"country_code" char(2) NOT NULL,
	"code" text NOT NULL,
	"name_en" text NOT NULL,
	CONSTRAINT "region_country_code_code_pk" PRIMARY KEY("country_code","code")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "report_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ad_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"ip_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reason_known" CHECK ("report"."reason" in ('spam','impersonation','offensive','stale','other'))
);
--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_country_code_country_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."country"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_genre" ADD CONSTRAINT "ad_genre_ad_id_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_genre" ADD CONSTRAINT "ad_genre_genre_genre_slug_fk" FOREIGN KEY ("genre") REFERENCES "public"."genre"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_link" ADD CONSTRAINT "ad_link_ad_id_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_role" ADD CONSTRAINT "ad_role_ad_id_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_role" ADD CONSTRAINT "ad_role_instrument_instrument_slug_fk" FOREIGN KEY ("instrument") REFERENCES "public"."instrument"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region" ADD CONSTRAINT "region_country_code_country_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."country"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_ad_id_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_country_idx" ON "ad" USING btree ("country_code","region_code","expires_at");--> statement-breakpoint
CREATE INDEX "ad_expiry_idx" ON "ad" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_public_id_idx" ON "ad" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "ad_genre_genre_idx" ON "ad_genre" USING btree ("genre");--> statement-breakpoint
CREATE INDEX "ad_role_open_idx" ON "ad_role" USING btree ("instrument");--> statement-breakpoint
CREATE INDEX "report_ad_idx" ON "report" USING btree ("ad_id");