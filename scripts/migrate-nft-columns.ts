/**
 * Manual migration: add ERC-721 NFT columns to claim_listings table.
 * Run: npx tsx scripts/migrate-nft-columns.ts
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { config } from "dotenv";

config();

async function main() {
  console.log("🔄 Running migration: adding NFT columns to claim_listings...");

  try {
    await db.execute(sql`
      ALTER TABLE claim_listings
        ADD COLUMN IF NOT EXISTS nft_token_id          INTEGER,
        ADD COLUMN IF NOT EXISTS nft_mint_tx_hash      TEXT,
        ADD COLUMN IF NOT EXISTS nft_transfer_tx_hash  TEXT;
    `);
    console.log("✅ Migration complete. Columns added:");
    console.log("   - nft_token_id (INTEGER, nullable)");
    console.log("   - nft_mint_tx_hash (TEXT, nullable)");
    console.log("   - nft_transfer_tx_hash (TEXT, nullable)");
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      console.log("✅ Columns already exist — nothing to do.");
    } else {
      console.error("❌ Migration failed:", err.message);
      process.exit(1);
    }
  }

  process.exit(0);
}

main();
