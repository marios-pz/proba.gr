ALTER TABLE "ad" ALTER COLUMN "edit_token_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "verify_token_hash" "bytea";--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "verify_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "renew_nudge_token_hash" "bytea";--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "renew_nudge_expires_at" timestamp with time zone;--> statement-breakpoint
-- Confirming the email is what flips an ad from unverified to published.
-- The edit token itself is minted by the app only on success (never
-- before), so this function only ever proves the verify link is genuine
-- and not expired; it does not touch edit_token_hash at all.
create or replace function verify_ad(p_public_id text, p_verify_token text)
returns boolean language plpgsql as $fn$
declare n integer;
begin
  update ad
     set status            = 'published',
         verified_at       = now(),
         published_at      = now(),
         verify_token_hash = null,
         verify_expires_at = null,
         updated_at        = now()
   where public_id = p_public_id
     and status = 'unverified'
     and verify_token_hash is not null
     and verify_expires_at > now()
     and verify_token_hash = digest(p_verify_token, 'sha256')
  returning 1 into n;
  return n = 1;
end $fn$;
--> statement-breakpoint
-- The day-11 reminder's "renew now" link. Deliberately its own token
-- rather than the edit token: that one was never stored in plaintext
-- anywhere past the instant it was minted, so there is no plaintext left
-- to put in a link sent days later. Same non-stacking greatest() as
-- ping_ad, and single-use: the nudge token is cleared on success.
create or replace function renew_via_nudge(p_public_id text, p_nudge_token text)
returns timestamptz language plpgsql as $fn$
declare v_new timestamptz;
begin
  update ad
     set expires_at             = greatest(now(), expires_at) + interval '14 days',
         renewed_count          = renewed_count + 1,
         reminded_at            = null,
         renew_nudge_token_hash = null,
         renew_nudge_expires_at = null,
         updated_at             = now()
   where public_id = p_public_id
     and status = 'published'
     and renew_nudge_token_hash is not null
     and renew_nudge_expires_at > now()
     and renew_nudge_token_hash = digest(p_nudge_token, 'sha256')
  returning expires_at into v_new;
  return v_new;   -- null means wrong/expired token or no such ad
end $fn$;