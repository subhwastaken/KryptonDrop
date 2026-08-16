// Drizzle schema for VelocityDrop on Monad.
// Data model enforcing unique drop entries per human.
//
// Type notes:
//   - nullifier_hash stored as numeric(78,0) — World ID nullifiers exceed bigint range.
//   - USDC amounts as numeric(20,6) — USDC has 6 decimals ($10 = 10.000000).
//   - human_key is the World ID nullifier (web) OR the AgentBook humanId (agent); both
//     resolve to "one unique human", so the unique constraint blocks cross-path double entry.

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// ---- Enums ----------------------------------------------------------------
export const dropStatus = pgEnum("drop_status", [
  "coming_soon",
  "open",
  "closed",
  "settled",
]);

export const entrySource = pgEnum("entry_source", ["web", "agent"]);

export const verificationLvl = pgEnum("verification_lvl", ["orb", "device"]);

export const entryStatus = pgEnum("entry_status", [
  "pending",
  "won",
  "lost",
  "purchased",
  "expired",
]);

export const orderStatus = pgEnum("order_status", [
  "awaiting_payment",
  "confirmed",
  "failed",
]);

export const listingStatus = pgEnum("listing_status", [
  "LISTED",
  "SOLD",
  "CANCELLED",
]);

// ---- Tables ---------------------------------------------------------------

export const drops = pgTable("drops", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: dropStatus("status").notNull().default("coming_soon"),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  totalSlots: integer("total_slots").notNull().default(1),
  priceUsdc: numeric("price_usdc", { precision: 20, scale: 6 }).notNull().default("0"),
  // Seedable RNG for deterministic demo wins (M6). Null = use a real CSPRNG.
  drawSeed: text("draw_seed"),
  // The World ID v4 action id created for this drop (M4). One action per drop.
  worldActionId: text("world_action_id"),
  // The merchant wallet a winner's USDC purchase is paid TO (M6). Null = use the
  // RECEIVER_ADDRESS / merchant default. Settlement is winner-wallet → this address.
  receiverAddress: text("receiver_address"),
  // When the most recent draw ran (M6). Null = not yet drawn.
  drawnAt: timestamp("drawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const variants = pgTable("variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  dropId: uuid("drop_id")
    .notNull()
    .references(() => drops.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "Silver" / "Black"
  sku: text("sku"),
  stock: integer("stock").notNull().default(0),
});

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dropId: uuid("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => variants.id, {
      onDelete: "set null",
    }),
    // The dedupe key: nullifier_hash (web) OR humanId (agent). Stored as text so both
    // namespaces fit. THIS is what UNIQUE(drop_id, human_key) enforces uniqueness over.
    humanKey: text("human_key").notNull(),
    source: entrySource("source").notNull(),
    nullifierHash: numeric("nullifier_hash", { precision: 78, scale: 0 }),
    humanId: text("human_id"),
    verificationLvl: verificationLvl("verification_lvl"),
    status: entryStatus("status").notNull().default("pending"),
    // The wallet this entry settles FROM if it wins (M6). Web entries map to the human
    // demo wallet; agent entries to the agent's registered wallet. Null until known.
    walletAddress: text("wallet_address"),
    // When a `won` entry's purchase window closes (M6). Past this → expired (no purchase).
    purchaseDeadline: timestamp("purchase_deadline", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // ★ THE SYBIL GUARANTEE — one entry per human per drop.
    unique("entries_drop_human_key_unique").on(t.dropId, t.humanKey),
  ],
);

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: text("wallet_address").notNull().unique(),
  humanId: text("human_id"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  // Option B ergonomic cache only — maps a session token 1:1 to a verified humanId.
  token: text("token").primaryKey(),
  humanId: text("human_id").notNull(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable so a standalone settlement (e.g. the M5 /api/admin/test-transfer that proves the
  // money path before the draw is wired) can be recorded without a winning entry. M6+ ties
  // real purchases to an entry.
  entryId: uuid("entry_id").references(() => entries.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").references(() => variants.id, {
    onDelete: "set null",
  }),
  amountUsdc: numeric("amount_usdc", { precision: 20, scale: 6 }).notNull(),
  txHash: text("tx_hash"),
  // Sender / recipient of the on-chain transfer (M5) — useful for the orders audit + demo.
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  status: orderStatus("status").notNull().default("awaiting_payment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claimListings = pgTable("claim_listings", {
  id: text("id").primaryKey(),
  dropId: uuid("drop_id")
    .notNull()
    .references(() => drops.id, { onDelete: "cascade" }),
  dropName: text("drop_name").notNull(),
  sellerAgentId: text("seller_agent_id").notNull(),
  sellerHumanId: text("seller_human_id").notNull(),
  sellerWalletAddress: text("seller_wallet_address").notNull().default(""),
  claimNftId: text("claim_nft_id").notNull(),
  askingPriceUsdc: numeric("asking_price_usdc", { precision: 20, scale: 6 }).notNull(),
  originalPriceUsdc: numeric("original_price_usdc", { precision: 20, scale: 6 }).notNull(),
  status: listingStatus("status").notNull().default("LISTED"),
  listedAt: timestamp("listed_at", { withTimezone: true }).notNull().defaultNow(),
  buyerAgentId: text("buyer_agent_id"),
  txHash: text("tx_hash"),
  // ERC-721 on-chain NFT fields (set after mint)
  nftTokenId: integer("nft_token_id"),           // real on-chain token ID
  nftMintTxHash: text("nft_mint_tx_hash"),        // tx hash of the mint
  nftTransferTxHash: text("nft_transfer_tx_hash"), // tx hash of the transfer on buy
});

// Convenient type exports for the service layer.
export type Drop = typeof drops.$inferSelect;
export type NewDrop = typeof drops.$inferInsert;
export type Variant = typeof variants.$inferSelect;
export type NewVariant = typeof variants.$inferInsert;
export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type ClaimListingRow = typeof claimListings.$inferSelect;
