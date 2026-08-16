ALTER TABLE "drops" ADD COLUMN "receiver_address" text;--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN "drawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "wallet_address" text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "purchase_deadline" timestamp with time zone;