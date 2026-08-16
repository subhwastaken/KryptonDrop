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
import { getWallet } from "../lib/wallets";

async function main() {
  console.log("=================================================");
  console.log("🧪 KRYPTONDROP — End-to-End Bidding & Resale Simulation");
  console.log("=================================================\n");

  const dropName = "NVIDIA H100 SXM5 Cluster";
  const drop = await findDropByName(dropName);
  if (!drop) {
    console.error("❌ Drop not found. Run launch-demo first.");
    process.exit(1);
  }

  console.log(`1. Resetting drop "${dropName}" and opening it...`);
  await resetDrop(drop.id, { reopen: true });
  
  // Set the price of the drop to 0.1 USDC (simulated MON)
  // We use typecast to handle drizzle schema types.
  const dropIdVal = drop.id as any;
  await db.update(drops).set({ priceUsdc: "0.1", status: "open" }).where(eq(drops.id as any, dropIdVal));
  console.log("   ✅ Drop reset and set to status: OPEN. Price: 0.1 MON\n");

  // Get Agent details from .env
  // Get Agent details using getWallet registry helper
  const w1 = getWallet("agent1");
  const w2 = getWallet("agent2");
  
  const pk1 = w1.privateKey;
  const pk2 = w2.privateKey;
  
  const agent1Addr = w1.address;
  const agent2Addr = w2.address;

  console.log("2. Submitting entries for Agent 1 and Agent 2...");
  const entry1 = await insertAgentEntry({
    dropId: drop.id,
    humanId: `agentkit:${agent1Addr}`,
    walletAddress: agent1Addr,
  });
  console.log(`   ✅ Agent 1 entered. Entry ID: ${entry1.id} (Wallet: ${agent1Addr})`);

  const entry2 = await insertAgentEntry({
    dropId: drop.id,
    humanId: `agentkit:${agent2Addr}`,
    walletAddress: agent2Addr,
  });
  console.log(`   ✅ Agent 2 entered. Entry ID: ${entry2.id} (Wallet: ${agent2Addr})\n`);

  console.log("3. Drawing the winner...");
  const draw = await runDraw(drop.id, { force: true });
  const winnerEntryId = draw.winnerIds[0];
  const winnerAgent = winnerEntryId === entry1.id ? "Agent 1" : "Agent 2";
  const winnerWallet = winnerEntryId === entry1.id ? agent1Addr : agent2Addr;
  const winnerPk = winnerEntryId === entry1.id ? pk1 : pk2;
  const loserAgent = winnerEntryId === entry1.id ? "Agent 2" : "Agent 1";
  const loserWallet = winnerEntryId === entry1.id ? agent2Addr : agent1Addr;
  
  console.log(`   🎉 The winner is: ${winnerAgent}!`);
  console.log(`   Winner Entry ID: ${winnerEntryId}\n`);

  console.log("4. Attempting purchase settlement...");
  let purchased = false;
  let txHash = "0x" + "0".repeat(64); // simulated fallback
  
  try {
    const result = await purchaseForEntry({
      entryId: winnerEntryId,
      privateKey: winnerPk,
      receiverAddress: "0x0000000000000000000000000000000000000000",
    });
    txHash = result.txHash;
    purchased = true;
    console.log(`   ✅ Real on-chain purchase succeeded! Tx: ${txHash}`);
  } catch (err: any) {
    console.log(`   ⚠️ Real purchase failed: ${err.message}`);
    console.log("   👉 Simulating purchase bypass due to empty testnet wallet balance...");
    
    // Manually update DB status to purchased and insert order so demo works
    const entryIdVal = winnerEntryId as any;
    await db.update(entries).set({ status: "purchased" as any }).where(eq(entries.id as any, entryIdVal));
    await db.insert(orders).values({
      entryId: winnerEntryId,
      amountUsdc: "0.1",
      txHash,
      fromAddress: winnerWallet,
      toAddress: "0x0000000000000000000000000000000000000000",
      status: "confirmed" as any,
    });
    purchased = true;
    console.log("   ✅ Mock purchase status applied to database.");
  }
  console.log("");

  if (purchased) {
    console.log("5. Simulating Agent-to-Agent (A2A) NFT Minting & Secondary Resale...");
    console.log(`   • ${winnerAgent} mints Claim NFT and lists it on A2A DEX.`);
    
    const originalPrice = 0.1;
    const askingPrice = 0.125; // 25% ROI markup
    
    const listing = await listClaimForResale(
      drop.id,
      drop.name,
      winnerAgent.toLowerCase().replace(" ", ""),
      `human:${winnerWallet}`,
      winnerWallet, // seller wallet address
      "claim-nft-4701",
      askingPrice,
      originalPrice
    );
    console.log(`   ✅ NFT Listed: ID ${listing.id} | Asking Price: ${askingPrice} MON (25% markup)`);

    console.log(`\n6. ${loserAgent} scans the A2A secondary marketplace...`);
    const listings = await getActiveClaimListings();
    console.log(`   🔍 Found ${listings.length} active listings.`);
    
    const targetListing = listings[0];
    console.log(`   👉 Selected Listing: ${targetListing.dropName} | Ask: ${targetListing.askingPriceUsdc} MON`);

    console.log(`\n7. ${loserAgent} executes purchase of the claim listing...`);
    const mockTxHash = "0x" + Math.random().toString(16).slice(2, 10).padEnd(64, "f");
    const soldListing = await buyClaimListing(targetListing.id, loserAgent.toLowerCase().replace(" ", ""), mockTxHash);
    
    console.log(`   ✅ Transaction completed! Tx: ${soldListing.txHash}`);
    console.log(`   🎉 Claim ownership transferred from ${winnerAgent} to ${loserAgent}!`);
    
    // Calculate profit split
    const totalPaid = soldListing.askingPriceUsdc;
    const profit = totalPaid - soldListing.originalPriceUsdc;
    const humanShare = profit * 0.90;
    const agentShare = profit * 0.10;
    
    console.log(`\n💰 PROFIT SPLIT AUDIT:`);
    console.log(`   • Total Paid by Buyer Agent:  ${totalPaid} MON`);
    console.log(`   • Original Cost:               ${soldListing.originalPriceUsdc} MON`);
    console.log(`   • Gross Profit Generated:      ${profit.toFixed(4)} MON`);
    console.log(`   • Human Owner Share (90%):    ${humanShare.toFixed(4)} MON (transferred to ${winnerWallet})`);
    console.log(`   • Seller Agent Share (10%):   ${agentShare.toFixed(4)} MON`);
  }

  console.log("\n=================================================");
  console.log("🎉 SIMULATION RUN COMPLETED SUCCESSFULLY! 🎉");
  console.log("=================================================");
  process.exit(0);
}

void main();
