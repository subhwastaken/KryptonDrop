import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { buyClaimListing, getListingById, updateNftTransferHash } from "@/lib/a2a.service";
import { getWallet } from "@/lib/wallets";
import { transferUsdc, getBalances } from "@/lib/settlement.service";
import { transferClaimNFT } from "@/lib/nft.service";
import { parseUnits } from "viem";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();

  try {
    const { listingId } = await req.json();
    if (!listingId) {
      return Response.json({ error: "Missing listingId" }, { status: 400 });
    }

    const listing = await getListingById(listingId);
    if (!listing) {
      return Response.json({ error: "Listing not found" }, { status: 404 });
    }

    // Block wash trading / self-purchasing
    if (session && listing.sellerHumanId === session.humanKey) {
      return Response.json({ error: "You cannot purchase your own listing!" }, { status: 400 });
    }

    // 1. Resolve agent wallets from registry
    const agent2Wallet = getWallet("agent2");
    const agent1Wallet = getWallet("agent1");
    if (!agent2Wallet || !agent1Wallet) {
      return Response.json({ error: "Agent wallets not configured" }, { status: 500 });
    }

    const agent2Pk   = agent2Wallet.privateKey;
    const agent2Addr = agent2Wallet.address;
    const agent1Pk   = agent1Wallet.privateKey;

    // 2. Check if Agent 2 needs funding to buy the voucher
    const agent2Balance = await getBalances(agent2Addr);
    const minRequiredWei = parseUnits(String(listing.askingPriceUsdc + 0.05), 18);

    if (agent2Balance.ethWei < minRequiredWei) {
      console.log(`[resale/buy] Funding Agent 2 with 0.5 MON from Agent 1...`);
      try {
        await transferUsdc({
          privateKey: agent1Pk,
          to: agent2Addr,
          amount: 0.5,
          recordOrder: false,
        });
        console.log(`[resale/buy] Agent 2 successfully funded.`);
      } catch (fundErr: any) {
        console.error("[resale/buy] Agent 2 funding failed:", fundErr);
        return Response.json({ error: `Failed to fund Agent 2: ${fundErr.message}` }, { status: 500 });
      }
    }

    // 3. Execute real on-chain MON transfer: Agent 2 → seller
    console.log(
      `[resale/buy] Executing on-chain transfer of ${listing.askingPriceUsdc} MON from Agent 2 to ${listing.sellerWalletAddress}...`
    );
    const tx = await transferUsdc({
      privateKey: agent2Pk,
      to: listing.sellerWalletAddress,
      amount: listing.askingPriceUsdc,
      recordOrder: false,
    });
    console.log(`[resale/buy] MON transaction confirmed: ${tx.txHash}`);

    // 4. Record the sale on the secondary market ledger
    const buyerId = "agent2";
    const updatedListing = await buyClaimListing(listingId, buyerId, tx.txHash);

    // 5. Transfer the ERC-721 NFT from seller → buyer (minter key does this autonomously)
    let nftTransferResult: { txHash: string; explorerUrl: string } | null = null;
    let nftTransferError: string | null = null;

    const hasNftTokenId = listing.nftTokenId != null;
    const hasSellerWallet = !!listing.sellerWalletAddress;
    const nftContractConfigured = !!process.env.NFT_CONTRACT_ADDRESS;

    if (nftContractConfigured && hasNftTokenId && hasSellerWallet) {
      try {
        // Transfer to Agent 2's wallet (the buyer)
        nftTransferResult = await transferClaimNFT(
          listing.sellerWalletAddress,
          agent2Addr,
          listing.nftTokenId!,
        );
        console.log(
          `[resale/buy] NFT #${listing.nftTokenId} transferred: ${nftTransferResult.txHash}`
        );
        await updateNftTransferHash(listingId, nftTransferResult.txHash);
      } catch (transferErr: any) {
        nftTransferError = transferErr.message || "NFT transfer failed";
        console.error("[resale/buy] NFT transfer error (non-fatal):", transferErr);
      }
    } else {
      nftTransferError = !nftContractConfigured
        ? "NFT_CONTRACT_ADDRESS not set"
        : !hasNftTokenId
        ? "No NFT minted for this listing (legacy listing)"
        : "Seller wallet not available";
    }

    return Response.json({
      ok: true,
      listing: updatedListing,
      settlement: {
        txHash: tx.txHash,
        explorerUrl: `https://testnet.monadexplorer.com/tx/${tx.txHash}`,
      },
      nftTransfer: nftTransferResult,
      nftTransferWarning: nftTransferError,
    });
  } catch (err: any) {
    console.error("[resale/buy] error:", err);
    return Response.json({ error: err.message || "Failed to purchase listing" }, { status: 500 });
  }
}
