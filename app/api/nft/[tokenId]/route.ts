// ERC-721 token metadata API — /api/nft/[tokenId]
// Serves standard OpenSea-compatible JSON for each minted ComputeClaimNFT.
// The tokenId is looked up against claim_listings to get drop name + seller.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { claimListings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr, 10);
  if (isNaN(tokenId) || tokenId <= 0) {
    return Response.json({ error: "Invalid token ID" }, { status: 400 });
  }

  // Find the listing that corresponds to this token ID
  const [listing] = await db
    .select()
    .from(claimListings)
    .where(eq(claimListings.nftTokenId, tokenId))
    .limit(1);

  const contractAddress = process.env.NFT_CONTRACT_ADDRESS || "Unknown";
  const explorerBase = "https://testnet.monadexplorer.com";

  const dropName  = listing?.dropName  || `Compute Claim #${tokenId}`;
  const seller    = listing?.sellerHumanId || "Unknown";
  const price     = listing?.originalPriceUsdc ? `${Number(listing.originalPriceUsdc).toFixed(2)} MON` : "N/A";
  const status    = listing?.status || "LISTED";
  const listedAt  = listing?.listedAt?.toISOString() || new Date().toISOString();

  // Build the on-chain SVG image as a data URI (fully on-chain, no IPFS needed)
  const svg = buildSvg(tokenId, dropName);
  const imageDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const metadata = {
    name: `KryptonDrop Compute Claim #${tokenId}`,
    description: `GPU Compute Voucher — ${dropName}. Minted on Monad Testnet. Contract: ${contractAddress}.`,
    image: imageDataUri,
    external_url: `${explorerBase}/token/${contractAddress}?a=${tokenId}`,
    attributes: [
      { trait_type: "Drop Name",        value: dropName },
      { trait_type: "Chain",            value: "Monad Testnet" },
      { trait_type: "Chain ID",         display_type: "number", value: 10143 },
      { trait_type: "Status",           value: status },
      { trait_type: "Original Price",   value: price },
      { trait_type: "Seller",           value: seller },
      { trait_type: "Listed At",        display_type: "date", value: Math.floor(new Date(listedAt).getTime() / 1000) },
      { trait_type: "Contract",         value: contractAddress },
    ],
  };

  return Response.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Content-Type": "application/json",
    },
  });
}

// ── On-chain SVG generator ────────────────────────────────────────────────────
function buildSvg(tokenId: number, dropName: string): string {
  const shortName = dropName.length > 22 ? dropName.slice(0, 22) + "…" : dropName;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f0f1a"/>
      <stop offset="100%" style="stop-color:#1a0f2e"/>
    </linearGradient>
    <linearGradient id="chip" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#84cc16"/>
      <stop offset="50%" style="stop-color:#10b981"/>
      <stop offset="100%" style="stop-color:#06b6d4"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <!-- Background -->
  <rect width="400" height="400" fill="url(#bg)" rx="16"/>
  <!-- Border -->
  <rect x="4" y="4" width="392" height="392" fill="none" stroke="#84cc16" stroke-width="2" rx="14" opacity="0.6"/>
  <!-- Top label -->
  <text x="20" y="38" fill="#84cc16" font-size="11" font-family="monospace" font-weight="bold">KRYPTONDROP · MONAD TESTNET · ERC-721</text>
  <!-- Chip graphic -->
  <rect x="130" y="130" width="140" height="140" fill="url(#chip)" rx="12" filter="url(#glow)" opacity="0.9"/>
  <!-- Chip lines -->
  <line x1="70"  y1="200" x2="130" y2="200" stroke="#84cc16" stroke-width="2" stroke-linecap="round"/>
  <line x1="270" y1="200" x2="330" y2="200" stroke="#06b6d4" stroke-width="2" stroke-linecap="round"/>
  <line x1="200" y1="70"  x2="200" y2="130" stroke="#10b981" stroke-width="2" stroke-linecap="round"/>
  <line x1="200" y1="270" x2="200" y2="330" stroke="#a855f7" stroke-width="2" stroke-linecap="round"/>
  <!-- Corner dots -->
  <circle cx="70"  cy="200" r="5" fill="#84cc16" filter="url(#glow)"/>
  <circle cx="330" cy="200" r="5" fill="#06b6d4" filter="url(#glow)"/>
  <circle cx="200" cy="70"  r="5" fill="#10b981" filter="url(#glow)"/>
  <circle cx="200" cy="330" r="5" fill="#a855f7" filter="url(#glow)"/>
  <!-- Chip label -->
  <text x="200" y="193" fill="#000" font-size="14" font-family="monospace" font-weight="bold" text-anchor="middle">SILICON</text>
  <text x="200" y="213" fill="#00000088" font-size="10" font-family="monospace" text-anchor="middle">COMPUTE</text>
  <!-- Token ID -->
  <text x="200" y="80" fill="#ffffff" font-size="28" font-family="monospace" font-weight="bold" text-anchor="middle">#${tokenId}</text>
  <!-- Drop name -->
  <text x="200" y="360" fill="#e2e8f0" font-size="13" font-family="monospace" text-anchor="middle">${shortName}</text>
  <!-- Bottom bar -->
  <text x="20"  y="385" fill="#4a5568" font-size="9"  font-family="monospace">CLAIM NFT · ID ${tokenId}</text>
  <text x="380" y="385" fill="#4a5568" font-size="9"  font-family="monospace" text-anchor="end">CHAIN 10143</text>
</svg>`;
}
