import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { entries, drops } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listClaimForResale, isClaimListed, updateNftMintFields } from "@/lib/a2a.service";
import { mintClaimNFT } from "@/lib/nft.service";
import { getSignedInHuman } from "@/lib/delegate.service";
import { findEntryForSignedInHuman } from "@/lib/entries.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const human = await getSignedInHuman();
  if (!human) {
    return Response.json(
      { error: "No signed-in World ID human — agent cannot list on their behalf" },
      { status: 401 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      entryId?: string;
      dropName?: string;
      askingPrice?: number;
    };

    const dropName = body.dropName ?? "NVIDIA H100 SXM5 Cluster";
    let entryId = body.entryId;

    if (!entryId) {
      const [drop] = await db
        .select({ id: drops.id })
        .from(drops)
        .where(eq(drops.name, dropName))
        .limit(1);
      if (!drop) {
        return Response.json({ error: `Drop "${dropName}" not found` }, { status: 404 });
      }
      const mine = await findEntryForSignedInHuman(drop.id, human.humanKey);
      if (!mine || mine.status !== "purchased") {
        return Response.json({ error: "No purchased H100 voucher for this human" }, { status: 404 });
      }
      entryId = mine.id;
    }

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
      .where(eq(entries.id, entryId))
      .limit(1);

    const owned = entry
      ? await findEntryForSignedInHuman(entry.dropId, human.humanKey)
      : undefined;
    if (!entry || !owned || owned.id !== entry.id) {
      return Response.json({ error: "Voucher entry not found for this human" }, { status: 404 });
    }
    if (entry.status !== "purchased") {
      return Response.json({ error: "Only purchased vouchers can be resold" }, { status: 400 });
    }
    if (await isClaimListed(entry.id)) {
      return Response.json({ error: "Voucher already listed for resale" }, { status: 409 });
    }

    const original = Number(entry.priceUsdc);
    const askingPrice =
      Number(body.askingPrice) > 0 ? Number(body.askingPrice) : Number((original * 1.25).toFixed(3));

    const listing = await listClaimForResale(
      entry.dropId,
      entry.dropName,
      "agent1",
      human.humanKey,
      entry.walletAddress || "",
      `claim-${entry.id}`,
      askingPrice,
      original,
    );

    let nft: Awaited<ReturnType<typeof mintClaimNFT>> | null = null;
    let mintWarning: string | null = null;
    if (process.env.NFT_CONTRACT_ADDRESS && entry.walletAddress) {
      try {
        nft = await mintClaimNFT(entry.walletAddress, entry.dropName, listing.id);
        await updateNftMintFields(listing.id, nft.tokenId, nft.txHash);
      } catch (mintErr) {
        mintWarning = mintErr instanceof Error ? mintErr.message : "NFT mint failed";
        console.error("[resale/agent-list] NFT mint error (non-fatal):", mintErr);
      }
    } else if (!process.env.NFT_CONTRACT_ADDRESS) {
      mintWarning = "NFT_CONTRACT_ADDRESS not set";
    }

    return Response.json(
      {
        ok: true,
        listing: {
          ...listing,
          nftTokenId: nft?.tokenId ?? null,
          nftMintTxHash: nft?.txHash ?? null,
        },
        nft: nft
          ? {
              tokenId: nft.tokenId,
              txHash: nft.txHash,
              explorerUrl: `https://testnet.monadvision.com/tx/${nft.txHash}`,
            }
          : null,
        mintWarning,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[resale/agent-list] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list voucher" },
      { status: 500 },
    );
  }
}
