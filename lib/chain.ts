// Monad Testnet (chain 10143) config + viem clients.
// Monad EVM execution engine (10k TPS, 1s block time).
// RPC: https://testnet-rpc.monad.xyz, Explorer: https://testnet.monadexplorer.com

import { createPublicClient, createWalletClient, http, getAddress, defineChain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" },
  },
});

export const CHAIN = monadTestnet; // id 10143
export const CHAIN_ID = 10143 as const;
export const EXPLORER = "https://testnet.monadexplorer.com";

// USDC/Mock Token on Monad Testnet. Treated as native MON (18 decimals).
export const USDC_ADDRESS = getAddress(
  process.env.MONAD_USDC_ADDRESS || "0xf8a8321714965d02F680f4f9CDA66f2C07D7ef4F"
);
export const USDC_DECIMALS = 18;

export function rpcUrl(): string {
  return (
    process.env.MONAD_TESTNET_RPC ||
    "https://testnet-rpc.monad.xyz"
  );
}

export function publicClient() {
  return createPublicClient({ chain: CHAIN, transport: http(rpcUrl()) });
}

export function walletClientFromKey(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  return {
    client: createWalletClient({ account, chain: CHAIN, transport: http(rpcUrl()) }),
    account,
  };
}

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER}/tx/${txHash}`;
}

// Minimal ERC-20 ABI: balanceOf + transfer (+ decimals for sanity).
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
