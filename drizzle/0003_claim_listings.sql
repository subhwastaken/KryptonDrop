CREATE TYPE "public"."listing_status" AS ENUM('LISTED', 'SOLD', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "claim_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"drop_id" uuid NOT NULL,
	"drop_name" text NOT NULL,
	"seller_agent_id" text NOT NULL,
	"seller_human_id" text NOT NULL,
	"seller_wallet_address" text DEFAULT '' NOT NULL,
	"claim_nft_id" text NOT NULL,
	"asking_price_usdc" numeric(20, 6) NOT NULL,
	"original_price_usdc" numeric(20, 6) NOT NULL,
	"status" "listing_status" DEFAULT 'LISTED' NOT NULL,
	"listed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"buyer_agent_id" text,
	"tx_hash" text
);--> statement-breakpoint
ALTER TABLE "claim_listings" ADD CONSTRAINT "claim_listings_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;