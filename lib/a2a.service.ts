// Agent-to-Agent (A2A) Resale & Strategy Service for Monad Drops.
// Enables AI Agents to manage drop strategies, evaluate ROI thresholds,
// and autonomously list/trade drop claim vouchers on the Monad ecosystem.

import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { claimListings } from "@/lib/db/schema";

export interface AgentStrategy {
  agentId: string;
  maxBudgetUsdc: number;
  maxItemPriceUsdc: number;
  minRoiPercent: number;
  autoResaleOnWin: boolean;
  targetCategories: string[];
}

export interface ClaimListing {
  id: string;
  dropId: string;
  dropName: string;
  sellerAgentId: string;
  sellerHumanId: string;
  sellerWalletAddress: string;
  claimNftId: string;
  askingPriceUsdc: number;
  originalPriceUsdc: number;
  status: "LISTED" | "SOLD" | "CANCELLED";
  listedAt: string;
  buyerAgentId?: string;
  txHash?: string;
  // ERC-721 on-chain NFT fields
  nftTokenId?: number;
  nftMintTxHash?: string;
  nftTransferTxHash?: string;
}

const agentStrategies = new Map<string, AgentStrategy>();

function toListing(row: typeof claimListings.$inferSelect): ClaimListing {
  return {
    id: row.id,
    dropId: row.dropId,
    dropName: row.dropName,
    sellerAgentId: row.sellerAgentId,
    sellerHumanId: row.sellerHumanId,
    sellerWalletAddress: row.sellerWalletAddress,
    claimNftId: row.claimNftId,
    askingPriceUsdc: Number(row.askingPriceUsdc),
    originalPriceUsdc: Number(row.originalPriceUsdc),
    status: row.status,
    listedAt: row.listedAt.toISOString(),
    buyerAgentId: row.buyerAgentId ?? undefined,
    txHash: row.txHash ?? undefined,
    nftTokenId: row.nftTokenId ?? undefined,
    nftMintTxHash: row.nftMintTxHash ?? undefined,
    nftTransferTxHash: row.nftTransferTxHash ?? undefined,
  };
}

/**
 * Register or update an AI Agent's bidding & resale strategy.
 */
export function setAgentStrategy(strategy: AgentStrategy): AgentStrategy {
  agentStrategies.set(strategy.agentId, strategy);
  return strategy;
}

export function getAgentStrategy(agentId: string): AgentStrategy | undefined {
  const existing = agentStrategies.get(agentId);
  if (existing) return existing;

  return {
    agentId,
    maxBudgetUsdc: Number(process.env.AGENT_MAX_BUDGET_USDC || "1000"),
    maxItemPriceUsdc: Number(process.env.AGENT_MAX_ITEM_PRICE_USDC || "900"),
    minRoiPercent: Number(process.env.AGENT_MIN_ROI_PERCENT || "15"),
    autoResaleOnWin: process.env.AGENT_AUTO_RESALE === "true",
    targetCategories: ["GPUs", "Hardware", "Sneakers"],
  };
}

/**
 * Evaluate if a drop matches an agent's configured strategy.
 */
export function evaluateDropStrategy(
  agentId: string,
  dropPriceUsdc: number,
  estimatedResaleUsdc: number,
  category: string
): { eligible: boolean; reason: string; expectedRoiPercent: number } {
  const strategy = getAgentStrategy(agentId);
  if (!strategy) {
    return { eligible: true, reason: "No strategy constraint set — proceeding default", expectedRoiPercent: 0 };
  }

  if (dropPriceUsdc > strategy.maxItemPriceUsdc) {
    return {
      eligible: false,
      reason: `Drop price ($${dropPriceUsdc}) exceeds agent max item limit ($${strategy.maxItemPriceUsdc})`,
      expectedRoiPercent: 0,
    };
  }

  const expectedRoiPercent = ((estimatedResaleUsdc - dropPriceUsdc) / dropPriceUsdc) * 100;
  if (expectedRoiPercent < strategy.minRoiPercent) {
    return {
      eligible: false,
      reason: `Estimated ROI (${expectedRoiPercent.toFixed(1)}%) is below required threshold (${strategy.minRoiPercent}%)`,
      expectedRoiPercent,
    };
  }

  return {
    eligible: true,
    reason: `Drop passes all strategic criteria (Estimated ROI: ${expectedRoiPercent.toFixed(1)}%)`,
    expectedRoiPercent,
  };
}

/**
 * List a won drop claim voucher on the A2A secondary marketplace.
 */
export async function listClaimForResale(
  dropId: string,
  dropName: string,
  sellerAgentId: string,
  sellerHumanId: string,
  sellerWalletAddress: string,
  claimNftId: string,
  askingPriceUsdc: number,
  originalPriceUsdc: number
): Promise<ClaimListing> {
  const id = `claim-list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(claimListings)
    .values({
      id,
      dropId,
      dropName,
      sellerAgentId,
      sellerHumanId,
      sellerWalletAddress,
      claimNftId,
      askingPriceUsdc: askingPriceUsdc.toFixed(6),
      originalPriceUsdc: originalPriceUsdc.toFixed(6),
      status: "LISTED",
    })
    .returning();
  return toListing(row);
}

/**
 * Fetch all active A2A claim listings on Monad.
 */
export async function getActiveClaimListings(): Promise<ClaimListing[]> {
  const rows = await db
    .select()
    .from(claimListings)
    .where(eq(claimListings.status, "LISTED"))
    .orderBy(desc(claimListings.listedAt));
  return rows.map(toListing);
}

export async function getAllClaimListings(): Promise<ClaimListing[]> {
  const rows = await db.select().from(claimListings).orderBy(desc(claimListings.listedAt));
  return rows.map(toListing);
}

/** LISTED + SOLD (shared board for every agent and the web UI). */
export async function getMarketListings(): Promise<ClaimListing[]> {
  const rows = await db
    .select()
    .from(claimListings)
    .where(ne(claimListings.status, "CANCELLED"))
    .orderBy(desc(claimListings.listedAt));
  return rows.map(toListing);
}

export function summarizeMarket(listings: ClaimListing[]) {
  const forSale = listings.filter((l) => l.status === "LISTED");
  const sold = listings.filter((l) => l.status === "SOLD");
  return {
    listings,
    for_sale: forSale,
    sold,
    for_sale_count: forSale.length,
    sold_count: sold.length,
  };
}

export async function isClaimListed(entryId: string): Promise<boolean> {
  const rows = await db
    .select({ id: claimListings.id })
    .from(claimListings)
    .where(eq(claimListings.claimNftId, `claim-${entryId}`))
    .limit(1);
  return rows.length > 0;
}

export async function getListingById(id: string): Promise<ClaimListing | undefined> {
  const [row] = await db.select().from(claimListings).where(eq(claimListings.id, id)).limit(1);
  return row ? toListing(row) : undefined;
}

/**
 * Execute an Agent-to-Agent purchase of a claim voucher.
 */
export async function buyClaimListing(
  listingId: string,
  buyerAgentId: string,
  mockTxHash: string
): Promise<ClaimListing> {
  const [row] = await db
    .update(claimListings)
    .set({
      status: "SOLD",
      buyerAgentId,
      txHash: mockTxHash,
    })
    .where(and(eq(claimListings.id, listingId), eq(claimListings.status, "LISTED")))
    .returning();

  if (!row) {
    const current = await getListingById(listingId);
    if (!current) {
      throw new Error("Claim listing not found");
    }
    throw new Error(
      `Listing is no longer available (Status: ${current.status}${
        current.buyerAgentId ? `, buyer: ${current.buyerAgentId}` : ""
      })`
    );
  }

  return toListing(row);
}

/**
 * Persist on-chain NFT mint details after a successful mint.
 */
export async function updateNftMintFields(
  listingId: string,
  nftTokenId: number,
  nftMintTxHash: string,
): Promise<ClaimListing> {
  const [row] = await db
    .update(claimListings)
    .set({ nftTokenId, nftMintTxHash, claimNftId: `claim-${nftTokenId}` })
    .where(eq(claimListings.id, listingId))
    .returning();
  return toListing(row);
}

/**
 * Persist on-chain NFT transfer tx hash after a successful transfer-on-buy.
 */
export async function updateNftTransferHash(
  listingId: string,
  nftTransferTxHash: string,
): Promise<void> {
  await db
    .update(claimListings)
    .set({ nftTransferTxHash })
    .where(eq(claimListings.id, listingId));
}
