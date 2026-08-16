/**
 * Deploy ComputeClaimNFT to Monad Testnet.
 *
 * Usage:
 *   npx tsx scripts/deploy-nft.ts
 *
 * After running, copy the printed contract address to .env:
 *   NFT_CONTRACT_ADDRESS=0x...
 *
 * Requires:
 *   DEMO_AGENT1_PK (or NFT_MINTER_PK) in .env — must have MON for gas.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import solc from "solc";
import { type Hex, createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "dotenv";

config(); // load .env

// ── Chain config ───────────────────────────────────────────────────────────────
const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" } },
});

const rpc = process.env.MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";

async function main() {
  // ── Load and compile the Solidity contract ─────────────────────────────────
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const solFile = readFileSync(join(__dirname, "../contracts/ComputeClaimNFT.sol"), "utf-8");

  console.log("🔨 Compiling ComputeClaimNFT.sol with solc...");

  const input = {
    language: "Solidity",
    sources: { "ComputeClaimNFT.sol": { content: solFile } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      optimizer: { enabled: true, runs: 200 },
    },
  };

  const outputRaw = solc.compile(JSON.stringify(input));
  const output = JSON.parse(outputRaw);

  // Surface any compiler errors
  const errors = output.errors || [];
  const fatalErrors = errors.filter((e: any) => e.severity === "error");
  if (fatalErrors.length > 0) {
    console.error("❌ Solidity compilation errors:");
    for (const e of fatalErrors) console.error(" ", e.formattedMessage);
    process.exit(1);
  }
  if (errors.length > 0) {
    for (const e of errors) console.warn("⚠️ ", e.formattedMessage);
  }

  const contractOutput = output.contracts["ComputeClaimNFT.sol"]["ComputeClaimNFT"];
  const abi      = contractOutput.abi;
  const bytecode = `0x${contractOutput.evm.bytecode.object}` as Hex;

  console.log("✅ Compiled successfully.");
  console.log(`   ABI entries: ${abi.length}`);
  console.log(`   Bytecode size: ${(bytecode.length - 2) / 2} bytes`);

  // ── Deploy ──────────────────────────────────────────────────────────────────
  const rawKey = process.env.NFT_MINTER_PK || process.env.DEMO_AGENT1_PK;
  if (!rawKey) {
    console.error("❌ Set NFT_MINTER_PK or DEMO_AGENT1_PK in .env");
    process.exit(1);
  }
  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
  const account    = privateKeyToAccount(privateKey);

  console.log(`\n🚀 Deploying from: ${account.address}`);
  console.log(`   RPC: ${rpc}`);

  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(rpc) });
  const publicC      = createPublicClient({ chain: monadTestnet, transport: http(rpc) });

  // Check balance
  const balance    = await publicC.getBalance({ address: account.address });
  const balanceMON = Number(balance) / 1e18;
  console.log(`   Balance: ${balanceMON.toFixed(4)} MON`);
  if (balance === 0n) {
    console.error("❌ Deployer has 0 MON. Fund it from https://faucet.monad.xyz");
    process.exit(1);
  }

  const txHash = await walletClient.deployContract({
    abi,
    bytecode,
    account,
    chain: monadTestnet,
  });

  console.log(`\n⏳ Deploy tx sent: ${txHash}`);
  console.log(`   https://testnet.monadexplorer.com/tx/${txHash}`);
  console.log("   Waiting for confirmation...");

  const receipt         = await publicC.waitForTransactionReceipt({ hash: txHash });
  const contractAddress = receipt.contractAddress;

  if (!contractAddress) {
    console.error("❌ Deploy failed — no contract address in receipt.");
    process.exit(1);
  }

  console.log(`\n✅ ComputeClaimNFT deployed!`);
  console.log(`   Contract: ${contractAddress}`);
  console.log(`   Explorer: https://testnet.monadexplorer.com/address/${contractAddress}`);
  console.log(`\n📋 Add this to your .env file:`);
  console.log(`   NFT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`   NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`\n   Also set (if not already):`);
  console.log(`   NFT_MINTER_PK=${rawKey}`);
}

main().catch((err) => {
  console.error("❌ Deploy failed:", err.message || err);
  process.exit(1);
});
