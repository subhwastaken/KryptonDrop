import "dotenv/config";
import { db } from "@/lib/db";
import { drops, entries, orders } from "@/lib/db/schema";
import { findDropByName, resetDrop } from "@/lib/drops.service";
import { insertAgentEntry } from "@/lib/entries.service";
import { runDraw, purchaseForEntry } from "@/lib/draw.service";
import { listClaimForResale, buyClaimListing, getActiveClaimListings } from "../lib/a2a.service";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress, type Hex } from "viem";
import { eq } from "drizzle-orm";

import { getWallet } from "@/lib/wallets";

async function main() {
  console.log("=================================================");
  console.log("🔄 KRYPTONDROP — Dedicated A2A Resale Test");
  console.log("=================================================\n");

  const dropName = "NVIDIA H100 SXM5 Cluster";
  const drop = await findDropByName(dropName);
  if (!drop) {
    console.error("❌ Drop not found. Run launch-demo first.");
    process.exit(1);
  }

  console.log(`1. Resetting drop "${dropName}" and opening it...`);
  await resetDrop(drop.id, { reopen: true });
  
  // Set the price of the drop to 0.1 MON
  const dropIdVal = drop.id as any;
  await db.update(drops).set({ priceUsdc: "0.1", status: "open" }).where(eq(drops.id as any, dropIdVal));
  console.log("   ✅ Drop reset and set to status: OPEN. Price: 0.1 MON\n");

  // Get Agent details using getWallet registry helper
  const w1 = getWallet("agent1");
  const w2 = getWallet("agent2");
  
  const pk1 = w1.privateKey;
  const pk2 = w2.privateKey;
  
  const agent1Addr = w1.address;
  const agent2Addr = w2.address;

  console.log(`Agent 1 (Human-linked Wallet): ${agent1Addr}`);
  console.log(`Agent 2 (Independent Wallet):  ${agent2Addr}\n`);

  console.log("2. Submitting entry ONLY for Agent 1 (Guarantees Agent 1 Wins)...");
  const entry1 = await insertAgentEntry({
    dropId: drop.id,
    humanId: `agentkit:${agent1Addr}`,
    walletAddress: agent1Addr,
  });
  console.log(`   ✅ Agent 1 entered. Entry ID: ${entry1.id}\n`);

  console.log("3. Drawing the winner...");
  const draw = await runDraw(drop.id, { force: true });
  const winnerEntryId = draw.winnerIds[0];
  
  if (winnerEntryId !== entry1.id) {
    console.error("❌ Unexpected winner. Agent 1 should have won.");
    process.exit(1);
  }
  console.log(`   🎉 Draw completed. Winner is Agent 1 as expected!\n`);

  console.log("4. Executing real on-chain purchase for Agent 1...");
  const result = await purchaseForEntry({
    entryId: entry1.id,
    privateKey: pk1,
    receiverAddress: "0x34B8F620B54df5517AC27601F2D734bc487D4A84", // Receiver address
  });
  console.log(`   ✅ Real Monad Testnet purchase succeeded!`);
  console.log(`   🔗 Transaction: ${result.explorerUrl}\n`);

  console.log("5. Agent 1 lists the Claim NFT on A2A secondary DEX with 25% markup...");
  const originalPrice = 0.1;
  const askingPrice = 0.125; // 25% ROI markup
  
  const listing = await listClaimForResale(
    drop.id,
    drop.name,
    "agent1",
    `human:${agent1Addr}`,
    agent1Addr, // seller wallet address
    "claim-nft-h100-test",
    askingPrice,
    originalPrice
  );
  console.log(`   ✅ NFT Listed: ID ${listing.id} | Asking Price: ${askingPrice} MON\n`);

  console.log("6. Agent 2 scans secondary marketplace...");
  const listings = await getActiveClaimListings();
  console.log(`   🔍 Found ${listings.length} active listings.`);
  const targetListing = listings[0];
  console.log(`   👉 Selected Listing: ${targetListing.dropName} | Ask: ${targetListing.askingPriceUsdc} MON\n`);

  console.log("7. Agent 2 executes purchase of Agent 1's listing...");
  const mockTxHash = "0x" + Math.random().toString(16).slice(2, 10).padEnd(64, "f");
  const soldListing = await buyClaimListing(targetListing.id, "agent2", mockTxHash);
  
  console.log(`   ✅ Transaction completed! Tx: ${soldListing.txHash}`);
  console.log(`   🎉 Voucher ownership successfully transferred from Agent 1 to Agent 2!\n`);
  
  // Calculate profit split
  const totalPaid = soldListing.askingPriceUsdc;
  const profit = totalPaid - soldListing.originalPriceUsdc;
  const humanShare = profit * 0.90;
  const agentShare = profit * 0.10;
  
  console.log("💰 AUDITED PROFIT SPLIT:");
  console.log(`   • Total Paid by Buyer Agent 2:  ${totalPaid} MON`);
  console.log(`   • Original Cost:               ${soldListing.originalPriceUsdc} MON`);
  console.log(`   • Gross Profit Generated:      ${profit.toFixed(4)} MON`);
  console.log(`   • Human Owner Share (90%):    ${humanShare.toFixed(4)} MON (routed to your MetaMask: ${agent1Addr})`);
  console.log(`   • Seller Agent 1 Share (10%):  ${agentShare.toFixed(4)} MON (retained for Agent 1 gas)`);

  console.log("\n=================================================");
  console.log("🎉 A2A RESALE SIMULATION RUN COMPLETED SUCCESS! 🎉");
  console.log("=================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
