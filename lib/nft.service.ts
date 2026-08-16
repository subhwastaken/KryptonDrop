// NFT Service — mint and transfer ComputeClaimNFT (ERC-721) on Monad Testnet.
// The backend minter key (DEMO_AGENT1_PK / NFT_MINTER_PK) is the only address
// allowed to call mint() and to freely transferFrom() on the contract.

import {
  type Hex,
  type Address,
  getAddress,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { publicClient, walletClientFromKey, EXPLORER, CHAIN } from "@/lib/chain";

// ── ABI (subset needed: mint + transferFrom + tokenURI + ownerOf) ─────────────
export const COMPUTE_CLAIM_NFT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to",  type: "address" },
      { name: "uri", type: "string"  },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "transferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from",    type: "address" },
      { name: "to",      type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

// ── Config helpers ────────────────────────────────────────────────────────────

export function getNftContractAddress(): Address {
  const addr = process.env.NFT_CONTRACT_ADDRESS;
  if (!addr) {
    throw new Error(
      "NFT_CONTRACT_ADDRESS is not set in .env — deploy the contract first with: pnpm tsx scripts/deploy-nft.ts"
    );
  }
  return getAddress(addr);
}

function getMinterKey(): Hex {
  const key = process.env.NFT_MINTER_PK || process.env.DEMO_AGENT1_PK;
  if (!key) throw new Error("NFT_MINTER_PK (or DEMO_AGENT1_PK) not set in .env");
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}

export function explorerNftUrl(tokenId: number): string {
  const addr = process.env.NFT_CONTRACT_ADDRESS;
  if (!addr) return "";
  return `${EXPLORER}/token/${addr}?a=${tokenId}`;
}

export function explorerTokenUrl(tokenId: number): string {
  return explorerNftUrl(tokenId);
}

// ── Mint ─────────────────────────────────────────────────────────────────────

export interface MintResult {
  tokenId: number;
  txHash: string;
  explorerUrl: string;
  metadataUri: string;
}

/**
 * Mint a new ComputeClaimNFT to `toAddress`.
 * The token URI is set to the dynamic metadata API endpoint for this token.
 * Returns the on-chain token ID extracted from the transaction receipt logs.
 */
export async function mintClaimNFT(
  toAddress: string,
  dropName: string,
  listingId: string,
  appBaseUrl?: string,
): Promise<MintResult> {
  const contractAddress = getNftContractAddress();
  const minterKey = getMinterKey();
  const to = getAddress(toAddress);

  // The token URI points to our dynamic metadata API.
  // We use a placeholder token ID in the URI that we'll update once we know the real tokenId.
  // Since the contract auto-increments IDs, we'll compute the URI after mint using the returned ID.
  const { client, account } = walletClientFromKey(minterKey);
  const pub = publicClient();

  // Use a temp URI first; we'll store the real one referencing the tokenId after the fact.
  // For simplicity, we use the listingId-based URI (our API route handles the lookup).
  const baseUrl = appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const metadataUri = `${baseUrl}/api/nft/by-listing/${listingId}`;

  // Monad charges gas_limit, not gas used — estimate then add at most 10%.
  const gasEstimate = await pub.estimateContractGas({
    address: contractAddress,
    abi: COMPUTE_CLAIM_NFT_ABI,
    functionName: "mint",
    args: [to, metadataUri],
    account,
  });
  const gas = gasEstimate + gasEstimate / 10n;

  const txHash = await client.writeContract({
    address: contractAddress,
    abi: COMPUTE_CLAIM_NFT_ABI,
    functionName: "mint",
    args: [to, metadataUri],
    account,
    chain: CHAIN,
    gas,
  });

  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });

  // Extract tokenId from the Transfer(address(0), to, tokenId) event log.
  // Transfer event topic0: keccak256("Transfer(address,address,uint256)") = 0xddf252...
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  let tokenId = 0;
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === contractAddress.toLowerCase() &&
      log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
      log.topics[1] === "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      // topics[3] = tokenId (indexed)
      tokenId = log.topics[3] ? parseInt(log.topics[3], 16) : 0;
      break;
    }
  }

  if (!tokenId) {
    throw new Error(`[nft.service] Could not extract tokenId from mint tx ${txHash}`);
  }

  return {
    tokenId,
    txHash,
    explorerUrl: explorerNftUrl(tokenId),
    metadataUri,
  };
}

// ── Transfer ─────────────────────────────────────────────────────────────────

export interface TransferResult {
  txHash: string;
  explorerUrl: string;
}

/**
 * Transfer a ComputeClaimNFT from seller to buyer.
 * The minter key is used as the caller (it has unconditional transferFrom rights in the contract).
 */
export async function transferClaimNFT(
  fromAddress: string,
  toAddress: string,
  tokenId: number,
): Promise<TransferResult> {
  const contractAddress = getNftContractAddress();
  const minterKey = getMinterKey();
  const from = getAddress(fromAddress);
  const to   = getAddress(toAddress);

  const { client, account } = walletClientFromKey(minterKey);
  const pub = publicClient();

  const gasEstimate = await pub.estimateContractGas({
    address: contractAddress,
    abi: COMPUTE_CLAIM_NFT_ABI,
    functionName: "transferFrom",
    args: [from, to, BigInt(tokenId)],
    account,
  });
  const gas = gasEstimate + gasEstimate / 10n;

  const txHash = await client.writeContract({
    address: contractAddress,
    abi: COMPUTE_CLAIM_NFT_ABI,
    functionName: "transferFrom",
    args: [from, to, BigInt(tokenId)],
    account,
    chain: CHAIN,
    gas,
  });

  await pub.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    explorerUrl: explorerNftUrl(tokenId),
  };
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getTokenOwner(tokenId: number): Promise<Address> {
  const contractAddress = getNftContractAddress();
  const pub = publicClient();
  return pub.readContract({
    address: contractAddress,
    abi: COMPUTE_CLAIM_NFT_ABI,
    functionName: "ownerOf",
    args: [BigInt(tokenId)],
  }) as Promise<Address>;
}
