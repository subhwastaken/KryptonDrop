import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { entries, drops } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  listClaimForResale,
  isClaimListed,
  updateNftMintFields,
} from "@/lib/a2a.service";
import { mintClaimNFT } from "@/lib/nft.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { entryId, askingPrice } = await req.json();
    if (!entryId || !askingPrice || isNaN(Number(askingPrice))) {
      return Response.json({ error: "Invalid parameters" }, { status: 400 });
    }

    // Get the entry and confirm ownership
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
          eq(entries.id, entryId),
          eq(entries.humanKey, session.humanKey)
        )
      )
      .limit(1);

    if (!entry) {
      return Response.json({ error: "Voucher entry not found" }, { status: 404 });
    }

    if (entry.status !== "purchased") {
      return Response.json({ error: "Only purchased vouchers can be resold" }, { status: 400 });
    }

    if (await isClaimListed(entry.id)) {
      return Response.json({ error: "Voucher already listed for resale" }, { status: 409 });
    }

    // 1. Create the DB listing record first (gives us the listingId we need for tokenURI)
    const listing = await listClaimForResale(
      entry.dropId,
      entry.dropName,
      "human-agent",
      session.humanKey,
      entry.walletAddress || "",
      `claim-${entry.id}`, // temporary — updated after mint
      Number(askingPrice),
      Number(entry.priceUsdc)
    );

    // 2. Mint the real ERC-721 NFT on Monad Testnet
    let nftResult: Awaited<ReturnType<typeof mintClaimNFT>> | null = null;
    let mintError: string | null = null;

    const sellerWallet = entry.walletAddress;
    const nftContractConfigured = !!process.env.NFT_CONTRACT_ADDRESS;

    if (nftContractConfigured && sellerWallet) {
      try {
        const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
        nftResult = await mintClaimNFT(
          sellerWallet,
          entry.dropName,
          listing.id,
          appBaseUrl,
        );
        console.log(
          `[resale/list] NFT minted: tokenId=${nftResult.tokenId} txHash=${nftResult.txHash}`
        );

        // 3. Write the real tokenId + mint tx back to the DB
        await updateNftMintFields(listing.id, nftResult.tokenId, nftResult.txHash);
      } catch (mintErr: any) {
        // Non-fatal: listing succeeds even if mint fails (e.g. NFT_CONTRACT_ADDRESS not set)
        mintError = mintErr.message || "NFT mint failed";
        console.error("[resale/list] NFT mint error (non-fatal):", mintErr);
      }
    } else if (!nftContractConfigured) {
      mintError = "NFT_CONTRACT_ADDRESS not set — run: pnpm tsx scripts/deploy-nft.ts";
      console.warn("[resale/list]", mintError);
    } else {
      mintError = "Seller wallet address not available for mint";
      console.warn("[resale/list]", mintError);
    }

    return Response.json(
      {
        ok: true,
        listing: {
          ...listing,
          nftTokenId: nftResult?.tokenId ?? null,
          nftMintTxHash: nftResult?.txHash ?? null,
        },
        nft: nftResult
          ? {
              tokenId: nftResult.tokenId,
              txHash: nftResult.txHash,
              explorerUrl: nftResult.explorerUrl,
              metadataUri: nftResult.metadataUri,
            }
          : null,
        mintWarning: mintError,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[resale/list] error:", err);
    return Response.json({ error: err.message || "Failed to list voucher" }, { status: 500 });
  }
}
