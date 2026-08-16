ALTER TABLE "orders" ALTER COLUMN "entry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "from_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "to_address" text;