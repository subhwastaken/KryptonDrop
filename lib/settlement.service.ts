// Token settlement on Monad Testnet (chain 10143). Plain TS service. Builds + sends an ERC-20
// `transfer` of tokens on chain 10143, waits for receipt, and records the result in `orders`.

import {
  parseUnits,
  formatUnits,
  getAddress,
  type Hex,
  type Address,
} from "viem";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  publicClient,
  walletClientFromKey,
  USDC_ADDRESS,
  USDC_DECIMALS,
  ERC20_ABI,
  explorerTxUrl,
} from "@/lib/chain";

export class SettlementError extends Error {}
export class InsufficientFundsError extends SettlementError {}

// $-string ("10") or raw-units bigint → raw USDC units (6 decimals). "10" → 10_000_000n.
export function toUsdcRaw(amount: string | number | bigint): bigint {
  if (typeof amount === "bigint") return amount;
  return parseUnits(String(amount), USDC_DECIMALS);
}

export function formatUsdc(raw: bigint): string {
  return formatUnits(raw, USDC_DECIMALS);
}

export interface Balances {
  address: Address;
  ethWei: bigint;
  eth: string;
  usdcRaw: bigint;
  usdc: string;
}

export async function getBalances(
  address: string,
  blockNumber?: bigint,
): Promise<Balances> {
  const addr = getAddress(address);
  const client = publicClient();
  // Pinning reads to a specific block avoids the read-after-write race where a public RPC
  // node briefly serves pre-tx state right after a receipt.
  // Since we use native MON for drops, the "USDC" balance is simply the native MON balance
  const ethWei = await client.getBalance({ address: addr, ...(blockNumber ? { blockNumber } : {}) });
  return {
    address: addr,
    ethWei,
    eth: formatUnits(ethWei, 18),
    usdcRaw: ethWei,
    usdc: formatUnits(ethWei, USDC_DECIMALS),
  };
}

export interface TransferInput {
  privateKey: Hex; // sender key (from resource files — never logged/committed)
  to: string;
  amount: string | number | bigint; // "$" string / number → 6-dec units, or raw bigint
  // Optional order bookkeeping
  entryId?: string | null;
  variantId?: string | null;
  recordOrder?: boolean; // default true — write an `orders` row
}

export interface TransferResult {
  txHash: string;
  explorerUrl: string;
  from: Address;
  to: Address;
  amountRaw: string; // raw units as string
  amountUsdc: string; // human ("10")
  status: "confirmed" | "failed";
  blockNumber: bigint; // block the transfer was mined in (for consistent balance reads)
  orderId?: string;
}

// Send a real USDC transfer on chain 4801. Pre-flights gas (native ETH) + USDC balance with
// actionable errors, waits for the receipt, and (by default) records an `orders` row.
export async function transferUsdc(input: TransferInput): Promise<TransferResult> {
  const to = getAddress(input.to);
  const amountRaw = toUsdcRaw(input.amount);
  const { client, account } = walletClientFromKey(input.privateKey);
  const from = account.address;
  const pub = publicClient();

  // --- Pre-flight: native MON balance for drop price + gas ---
  const ethWei = await pub.getBalance({ address: from });

  // A native MON transfer needs to cover the purchase amount plus some gas
  if (ethWei < amountRaw) {
    throw new InsufficientFundsError(
      `sender ${from} has ${formatUsdc(ethWei)} MON, needs ${formatUsdc(amountRaw)} MON. ` +
        `Fund via Monad Testnet Faucet.`,
    );
  }

  // --- Send native MON transaction ---
  let txHash: Hex;
  try {
    txHash = await client.sendTransaction({
      to,
      value: amountRaw,
      account,
      chain: client.chain,
    });
  } catch (err) {
    throw new SettlementError(
      `MON transfer send failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // --- Wait for the receipt ---
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  const status: "confirmed" | "failed" = receipt.status === "success" ? "confirmed" : "failed";

  // --- Record the order (optional; entry_id nullable for standalone test transfers) ---
  let orderId: string | undefined;
  if (input.recordOrder !== false) {
    const [row] = await db
      .insert(orders)
      .values({
        entryId: input.entryId ?? null,
        variantId: input.variantId ?? null,
        amountUsdc: formatUsdc(amountRaw),
        txHash,
        fromAddress: from,
        toAddress: to,
        status,
      })
      .returning();
    orderId = row.id;
  }

  return {
    txHash,
    explorerUrl: explorerTxUrl(txHash),
    from,
    to,
    amountRaw: amountRaw.toString(),
    amountUsdc: formatUsdc(amountRaw),
    status,
    blockNumber: receipt.blockNumber,
    orderId,
  };
}
