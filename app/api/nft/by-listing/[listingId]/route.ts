// ERC-721 token metadata API — /api/nft/by-listing/[listingId]
// Used as the tokenURI at mint time (before we know the tokenId).
// Redirects to the canonical /api/nft/[tokenId] once the nftTokenId is stored.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { claimListings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const { listingId } = await params;

  const [listing] = await db
    .select()
    .from(claimListings)
    .where(eq(claimListings.id, listingId))
    .limit(1);

  if (!listing) {
    return Response.json({ error: "Listing not found" }, { status: 404 });
  }

  // If we already have the real tokenId, redirect to canonical URL
  if (listing.nftTokenId) {
    return Response.redirect(
      new URL(`/api/nft/${listing.nftTokenId}`, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
      307,
    );
  }

  // Fallback: serve metadata inline using listingId
  const contractAddress = process.env.NFT_CONTRACT_ADDRESS || "Unknown";
  const dropName  = listing.dropName || "Compute Claim";
  const shortName = dropName.length > 22 ? dropName.slice(0, 22) + "…" : dropName;
  const price     = listing.originalPriceUsdc ? `${Number(listing.originalPriceUsdc).toFixed(2)} MON` : "N/A";
  const pseudoId  = listing.id.slice(-6).toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <rect width="400" height="400" fill="#0f0f1a" rx="16"/>
  <rect x="4" y="4" width="392" height="392" fill="none" stroke="#84cc16" stroke-width="2" rx="14" opacity="0.6"/>
  <text x="20" y="38" fill="#84cc16" font-size="11" font-family="monospace" font-weight="bold">KRYPTONDROP · MONAD TESTNET · ERC-721</text>
  <text x="200" y="80" fill="#ffffff" font-size="22" font-family="monospace" font-weight="bold" text-anchor="middle">#${pseudoId}</text>
  <text x="200" y="360" fill="#e2e8f0" font-size="13" font-family="monospace" text-anchor="middle">${shortName}</text>
  <text x="20"  y="385" fill="#4a5568" font-size="9" font-family="monospace">CLAIM NFT (PENDING)</text>
  <text x="380" y="385" fill="#4a5568" font-size="9" font-family="monospace" text-anchor="end">CHAIN 10143</text>
</svg>`;

  return Response.json({
    name: `KryptonDrop Compute Claim — ${dropName}`,
    description: `GPU Compute Voucher — ${dropName}. Minted on Monad Testnet.`,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    attributes: [
      { trait_type: "Drop Name",      value: dropName },
      { trait_type: "Chain",          value: "Monad Testnet" },
      { trait_type: "Status",         value: listing.status },
      { trait_type: "Original Price", value: price },
    ],
  }, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
