import "dotenv/config";
import { createPublicClient, http, formatUnits, getAddress } from "viem";

const RPC = process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";
const USDC = getAddress(process.env.MONAD_USDC_ADDRESS || "0xf8a8321714965d02F680f4f9CDA66f2C07D7ef4F");

const chain = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const wallets = [
  ["Agent 1", "0x8BAf91Af9682b5Cc0d69DBE7152f962558D754a7"],
  ["Agent 2", "0xE56F3bA6A66A51c0783069390278e14bdB5A1389"],
  ["Human",   "0x14BAf4Ab5D7324bfdD9De78d5d7c0BF63F639781"],
  ["AgentWallet(secret_keys)", "0x49Eb10a0f136f02A09E5D0702eF0f94521873613"],
] as const;

const erc20 = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint8" }] },
] as const;

async function main() {
  const client = createPublicClient({ chain, transport: http(RPC) });
  const dec = await client.readContract({ address: USDC, abi: erc20, functionName: "decimals" }).catch(() => 6);
  console.log(`chain ${chain.id} (${chain.name}) · USDC decimals =`, dec, "\n");
  for (const [name, addr] of wallets) {
    const a = getAddress(addr);
    const eth = await client.getBalance({ address: a });
    const usdc = await client.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [a] }).catch(() => BigInt(0)) as bigint;
    console.log(name.padEnd(26), "MON", formatUnits(eth, 18).padEnd(12), "USDC", formatUnits(usdc, Number(dec)));
  }
  process.exit(0);
}
main().catch((e) => { console.error("RPC error:", e.message); process.exit(1); });
