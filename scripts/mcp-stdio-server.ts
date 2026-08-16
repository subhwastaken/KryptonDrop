import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getAddress, parseUnits } from "viem";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { entries, drops } from "../lib/db/schema";

import {
  listDrops,
  getDropWithVariants,
  getDrop,
} from "../lib/drops.service";
import {
  insertAgentEntry,
  findEntryByHumanKey,
  countDropEntries,
  AlreadyEnteredError,
} from "../lib/entries.service";
import {
  setAgentStrategy,
  getMarketListings,
  summarizeMarket,
  buyClaimListing,
  getListingById,
  listClaimForResale,
  isClaimListed,
  updateNftMintFields,
  updateNftTransferHash,
} from "../lib/a2a.service";
import { mintClaimNFT, transferClaimNFT } from "../lib/nft.service";
import {
  purchaseForEntry,
  NotAWinnerError,
  WindowExpiredError,
  AlreadyPurchasedError,
} from "../lib/draw.service";
import { getWallet, getReceiverAddress } from "../lib/wallets";
import { InsufficientFundsError, transferUsdc, getBalances } from "../lib/settlement.service";
import { applyDueTransitions } from "../lib/lifecycle.service";
import {
  authorizeOnBehalf,
  NoSignedInHumanError,
  UnauthorizedAgentError,
} from "../lib/delegate.service";

// Helpers
function ok(data: unknown, summary?: string) {
  const text = summary ? `${summary}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}
function fail(message: string, extra?: unknown) {
  const text = extra ? `${message}\n\n${JSON.stringify(extra, null, 2)}` : message;
  return { content: [{ type: "text" as const, text }], isError: true };
}

// Agent1/agent2 wallet from .env; human slot is the World ID user currently signed in on the web.
function getAgentWallet() {
  const agentChoice = process.argv[2] === "agent2" ? "agent2" : "agent1";
  const wallet = getWallet(agentChoice);
  const address = getAddress(wallet.address);
  return {
    address,
    privateKey: wallet.privateKey,
  };
}

async function getOnBehalf() {
  const wallet = getAgentWallet();
  const ctx = await authorizeOnBehalf(wallet.address);
  return { ...wallet, humanId: ctx.humanKey };
}

const server = new McpServer(
  { name: "krypton-drop-mcp-stdio", version: "1.0.0" },
  {
    instructions:
      "KryptonDrop: a high-speed bot-proof scarce-goods drop platform on Monad Testnet. " +
      "This agent may act only ON BEHALF OF one signed-in World ID human (anti-bot: no extra agents, no unsigned bots). " +
      "Sign in with World ID in the browser first, then use list_drops / enter_draw / check_status / purchase. " +
      "Entries share that human's slot so the web UI stays in sync. Winners settle on Monad Testnet.",
  }
);

// --- list_drops -----------------------------------------------------------------
server.registerTool(
  "list_drops",
  {
    title: "List drops",
    description: "List all drops (open + coming-soon) with variants, prices, and countdowns.",
    inputSchema: {},
  },
  async () => {
    const drops = await listDrops();
    return ok({ drops }, `${drops.length} drop(s) found.`);
  }
);

// --- get_drop_info --------------------------------------------------------------
server.registerTool(
  "get_drop_info",
  {
    title: "Get drop info",
    description: "Get detailed status, variants, pricing, and entries for a specific drop.",
    inputSchema: { drop_id: z.string().describe("The drop id (uuid) to inspect.") },
  },
  async ({ drop_id }) => {
    await applyDueTransitions();
    const drop = await getDropWithVariants(drop_id);
    if (!drop) return fail(`drop ${drop_id} not found`);
    const entered = await countDropEntries(drop_id);
    return ok({ drop, unique_humans_entered: entered }, `${drop.name} has ${entered} entry/entries.`);
  }
);

// --- enter_draw -----------------------------------------------------------------
server.registerTool(
  "enter_draw",
  {
    title: "Enter the draw",
    description: "Reserve a per-second GPU compute rental slot for a drop. Enforces one slot per verified human.",
    inputSchema: {
      drop_id: z.string().describe("The drop id (uuid) to enter."),
      variant: z.string().optional().describe("Variant name or variant id (optional)."),
    },
  },
  async ({ drop_id, variant }) => {
    try {
      await applyDueTransitions();
      const { address, humanId } = await getOnBehalf();
      
      const drop = await getDropWithVariants(drop_id);
      if (!drop) return fail(`drop ${drop_id} not found`);
      if (drop.status !== "open") {
        return fail(`drop "${drop.name}" is ${drop.status}, not open for entries`);
      }

      let variantId: string | null = null;
      if (variant) {
        const v =
          drop.variants.find((x) => x.id === variant) ??
          drop.variants.find((x) => x.name.toLowerCase() === variant.toLowerCase());
        if (!v) {
          return fail(`variant "${variant}" not found`, { available: drop.variants.map((x) => x.name) });
        }
        variantId = v.id;
      }

      const entry = await insertAgentEntry({
        dropId: drop_id,
        humanId,
        variantId,
        walletAddress: address,
      });

      return ok(
        { entered: true, entry_id: entry.id, drop: drop.name, wallet: address, on_behalf_of: "signed-in World ID user" },
        `Entered "${drop.name}" on behalf of the signed-in World ID user.`,
      );
    } catch (err) {
      if (err instanceof AlreadyEnteredError) {
        return ok({ entered: false, already_entered: true }, `Already entered this drop (same World ID human).`);
      }
      if (err instanceof NoSignedInHumanError) return fail(err.message);
      if (err instanceof UnauthorizedAgentError) return fail(err.message);
      return fail((err as Error).message);
    }
  }
);

// --- check_status ---------------------------------------------------------------
server.registerTool(
  "check_status",
  {
    title: "Check my entry status",
    description: "Check your entry status for a drop (pending / won / lost / purchased / expired).",
    inputSchema: { drop_id: z.string().describe("The drop id (uuid).") },
  },
  async ({ drop_id }) => {
    try {
      await applyDueTransitions();
      const { humanId } = await getOnBehalf();
      const drop = await getDropWithVariants(drop_id);
      if (!drop) return fail(`drop ${drop_id} not found`);
      const mine = await findEntryByHumanKey(drop_id, humanId);
      return ok(
        {
          drop: drop.name,
          entered: !!mine,
          entry_status: mine?.status ?? null,
          entry_id: mine?.id ?? null,
        },
        mine ? `Your status for "${drop.name}" is: ${mine.status}` : `You haven't entered "${drop.name}".`
      );
    } catch (err) {
      if (err instanceof NoSignedInHumanError) return fail(err.message);
      if (err instanceof UnauthorizedAgentError) return fail(err.message);
      return fail((err as Error).message);
    }
  }
);

// --- purchase -------------------------------------------------------------------
server.registerTool(
  "purchase",
  {
    title: "Purchase (winners only)",
    description: "Settle payment on Monad Testnet if your agent won the drop.",
    inputSchema: { drop_id: z.string().describe("The drop id (uuid) you won.") },
  },
  async ({ drop_id }) => {
    try {
      await applyDueTransitions();
      const { privateKey, humanId } = await getOnBehalf();
      const entry = await findEntryByHumanKey(drop_id, humanId);
      if (!entry) return fail("you have not entered this drop");
      
      const drop = await getDrop(drop_id);
      if (!drop) return fail(`drop ${drop_id} not found`);

      const receiver = drop.receiverAddress || getReceiverAddress();
      const result = await purchaseForEntry({
        entryId: entry.id,
        privateKey,
        receiverAddress: receiver,
      });

      return ok(
        { purchased: true, tx_hash: result.txHash, explorer_url: result.explorerUrl },
        `Purchased "${drop.name}" successfully! Tx: ${result.txHash}`
      );
    } catch (err) {
      if (err instanceof NoSignedInHumanError) return fail(err.message);
      if (err instanceof UnauthorizedAgentError) return fail(err.message);
      if (err instanceof NotAWinnerError) return fail("Not a winner");
      if (err instanceof WindowExpiredError) return fail("Purchase window expired");
      if (err instanceof AlreadyPurchasedError) return fail("Already purchased");
      if (err instanceof InsufficientFundsError) return fail("Insufficient funds on Monad");
      return fail((err as Error).message);
    }
  }
);

// --- set_agent_strategy ---------------------------------------------------------
server.registerTool(
  "set_agent_strategy",
  {
    title: "Set agent strategy",
    description: "Configure autonomous bidding budget, item price cap, and resale rules.",
    inputSchema: {
      agent_id: z.string().describe("Unique identifier of the AI agent"),
      max_budget_usdc: z.number().positive().describe("Maximum total budget in USDC"),
      max_item_price_usdc: z.number().positive().describe("Maximum price per item drop in USDC"),
      min_roi_percent: z.number().nonnegative().describe("Minimum required resale ROI % to enter drop"),
      auto_resale_on_win: z.boolean().describe("Whether to automatically list won claim NFTs on Monad DEX"),
    },
  },
  async ({ agent_id, max_budget_usdc, max_item_price_usdc, min_roi_percent, auto_resale_on_win }) => {
    const strategy = setAgentStrategy({
      agentId: agent_id,
      maxBudgetUsdc: max_budget_usdc,
      maxItemPriceUsdc: max_item_price_usdc,
      minRoiPercent: min_roi_percent,
      autoResaleOnWin: auto_resale_on_win,
      targetCategories: ["GPUs", "Hardware"],
    });
    return ok(strategy, `Configured strategy for agent "${agent_id}".`);
  }
);

// --- get_active_listings --------------------------------------------------------
server.registerTool(
  "get_active_listings",
  {
    title: "Get active listings",
    description:
      "List A2A marketplace vouchers from the shared database (LISTED and SOLD). Buy only listings with status LISTED.",
    inputSchema: {},
  },
  async () => {
    const market = summarizeMarket(await getMarketListings());
    return ok(
      market,
      `Marketplace: ${market.for_sale_count} for sale, ${market.sold_count} sold.`
    );
  }
);

// --- buy_secondary_listing ------------------------------------------------------
server.registerTool(
  "buy_secondary_listing",
  {
    title: "Buy secondary listing",
    description: "Purchase a listed compute voucher on the A2A secondary DEX using Agent 2's wallet.",
    inputSchema: {
      listing_id: z.string().describe("The ID of the claim listing to purchase."),
    },
  },
  async ({ listing_id }) => {
    try {
      const listing = await getListingById(listing_id);
      if (!listing) return fail(`Listing ${listing_id} not found`);
      if (listing.status === "SOLD") {
        return fail(
          `Listing already SOLD to ${listing.buyerAgentId || "another buyer"}`,
          listing
        );
      }
      if (listing.status !== "LISTED") {
        return fail(`Listing is not for sale (Status: ${listing.status})`, listing);
      }

      // 1. Resolve agent wallets from registry
      const agent2Wallet = getWallet("agent2");
      const agent1Wallet = getWallet("agent1");
      const agent2Pk = agent2Wallet.privateKey;
      const agent2Addr = agent2Wallet.address;
      const agent1Pk = agent1Wallet.privateKey;

      // 2. Check if Agent 2 needs funding
      const agent2Balance = await getBalances(agent2Addr);
      const minRequiredWei = parseUnits(String(listing.askingPriceUsdc + 0.05), 18);

      if (agent2Balance.ethWei < minRequiredWei) {
        console.error(`[mcp] Funding Agent 2 with 0.5 MON from Agent 1...`);
        await transferUsdc({
          privateKey: agent1Pk,
          to: agent2Addr,
          amount: 0.5,
          recordOrder: false,
        });
      }

      // 3. Execute real on-chain transfer
      console.error(`[mcp] Transferring ${listing.askingPriceUsdc} MON from Agent 2 to ${listing.sellerWalletAddress}...`);
      const tx = await transferUsdc({
        privateKey: agent2Pk,
        to: listing.sellerWalletAddress,
        amount: listing.askingPriceUsdc,
        recordOrder: false,
      });

      // 4. Update the ledger
      const buyerId = "agent2";
      await buyClaimListing(listing_id, buyerId, tx.txHash);

      let nftTransfer: { txHash: string; explorerUrl: string } | null = null;
      if (listing.nftTokenId != null && listing.sellerWalletAddress) {
        try {
          nftTransfer = await transferClaimNFT(
            listing.sellerWalletAddress,
            agent2Addr,
            listing.nftTokenId,
          );
          await updateNftTransferHash(listing_id, nftTransfer.txHash);
        } catch (transferErr) {
          console.error("[mcp] NFT transfer failed (non-fatal):", transferErr);
        }
      }

      return ok(
        {
          purchased: true,
          tx_hash: tx.txHash,
          explorer_url: tx.explorerUrl,
          nft_transfer_tx: nftTransfer?.txHash ?? null,
          nft_transfer_explorer: nftTransfer
            ? `https://testnet.monadvision.com/tx/${nftTransfer.txHash}`
            : null,
        },
        `Agent 2 purchased "${listing.dropName}" secondary listing on-chain! Tx: ${tx.txHash}`
      );
    } catch (err) {
      return fail((err as Error).message);
    }
  }
);

// --- list_secondary_voucher -----------------------------------------------------
server.registerTool(
  "list_secondary_voucher",
  {
    title: "List secondary voucher",
    description: "List a won and purchased GPU compute voucher on the A2A secondary DEX for resale.",
    inputSchema: {
      entry_id: z.string().describe("The entry ID (uuid) of the purchased voucher."),
      asking_price: z.number().positive().describe("The resale asking price in MON (e.g. 0.125)."),
    },
  },
  async ({ entry_id, asking_price }) => {
    try {
      await applyDueTransitions();
      const { humanId } = await getOnBehalf();

      // Find the entry and confirm ownership
      const [entry] = await db
        .select({
          id: entries.id,
          status: entries.status,
          dropId: entries.dropId,
          walletAddress: entries.walletAddress,
          dropName: drops.name,
          priceUsdc: drops.priceUsdc,
        })
        .from(entries)
        .innerJoin(drops, eq(entries.dropId, drops.id))
        .where(
          and(
            eq(entries.id, entry_id),
            eq(entries.humanKey, humanId)
          )
        )
        .limit(1);

      if (!entry) return fail("Voucher entry not found");
      if (entry.status !== "purchased") return fail("Only purchased vouchers can be listed for resale");
      if (await isClaimListed(entry.id)) return fail("Voucher already listed for resale");

      const listing = await listClaimForResale(
        entry.dropId,
        entry.dropName,
        "agent1", // seller agent id
        humanId,  // seller human id
        entry.walletAddress || "", // seller wallet address
        `claim-${entry.id}`,
        asking_price,
        Number(entry.priceUsdc)
      );

      let nft: Awaited<ReturnType<typeof mintClaimNFT>> | null = null;
      if (process.env.NFT_CONTRACT_ADDRESS && entry.walletAddress) {
        try {
          nft = await mintClaimNFT(entry.walletAddress, entry.dropName, listing.id);
          await updateNftMintFields(listing.id, nft.tokenId, nft.txHash);
        } catch (mintErr) {
          console.error("[mcp] NFT mint failed (non-fatal):", mintErr);
        }
      }

      return ok(
        {
          ...listing,
          nftTokenId: nft?.tokenId ?? null,
          nftMintTxHash: nft?.txHash ?? null,
          monadvision_tx: nft ? `https://testnet.monadvision.com/tx/${nft.txHash}` : null,
          monadvision_contract: process.env.NFT_CONTRACT_ADDRESS
            ? `https://testnet.monadvision.com/address/${process.env.NFT_CONTRACT_ADDRESS}?tab=Transaction`
            : null,
        },
        nft
          ? `Voucher listed and NFT #${nft.tokenId} minted on Monad Testnet. Tx: ${nft.txHash}`
          : `Voucher listed for resale on secondary market at ${asking_price} MON.`,
      );
    } catch (err) {
      if (err instanceof NoSignedInHumanError) return fail(err.message);
      if (err instanceof UnauthorizedAgentError) return fail(err.message);
      return fail((err as Error).message);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 KryptonDrop Stdio MCP Server running!");
}

main().catch((err) => {
  console.error("❌ Stdio Server failed to start:", err);
  process.exit(1);
});
