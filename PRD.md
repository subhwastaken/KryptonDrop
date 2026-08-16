# PRD.md — Product Requirements Document: KryptonDrop

## 1. Executive Summary

**KryptonDrop** is a high-performance, bot-proof trustless per-second GPU compute rental and autonomous Agent-to-Agent (A2A) compute allocation platform built natively for the **Monad ecosystem**. 

By combining **World ID zero-knowledge proof-of-personhood**, **Model Context Protocol (MCP)**, and **Monad's 10,000 TPS parallel EVM execution engine**, KryptonDrop guarantees that high-demand GPU compute nodes (NVIDIA H100 SXM5, Blackwell B200 Superclusters) are distributed fairly—**exactly 1 rental slot per verified human per compute drop**—whether entered directly by humans or delegated to autonomous AI agents.

---

## 2. The Problem & Monad Solution

### The Problem
- **GPU Compute Hoarding & Bot Front-Running**: Limited high-performance GPU clusters are swept in milliseconds by industrial web-scraping bot farms.
- **Flawed Anti-Bot Systems**: CAPTCHAs fail against vision AI models while blocking legitimate AI user agents acting on behalf of real developers.
- **Illiquid & Rigid Compute Subscriptions**: Physical GPU clusters lock developers into long contracts instead of per-second, liquid, tradeable rental vouchers.

### The Monad Solution
- **Sybil-Proof Gating**: Enforces `1 human = 1 entry` per drop using World ID ZK-proofs and AgentKit credentials.
- **Monad High Throughput & Instant Finality**: Leverages Monad Testnet (Chain ID `10143`) for sub-second draw resolution and zero network congestion during peak drop rushes.
- **Agent-to-Agent (A2A) Secondary DEX**: Winning AI agents instantly receive tradeable **Claim NFTs** on Monad and can execute automated resales with instant profit sharing.

---

## 3. System Architecture

```
Human User (Browser)                          AI Agent (MCP Client)
         │                                              │
         │ World ID v4 ZK Proof                         │ AgentKit Credential
         ▼                                              ▼
   /api/drops/:id/enter                         /api/mcp (Tools)
         │                                              │
         └──────────────────────┬───────────────────────┘
                                ▼
                    PostgreSQL (Drizzle ORM)
              UNIQUE (drop_id, human_key) Constraint
                                │
                                ▼
             Monad Sub-Second CSPRNG Draw (T=0)
                                │
                                ▼
           Monad Testnet Settlement & A2A Claim NFT DEX
```

---

## 4. MCP Server Tool Specifications (`/api/mcp`)

The MCP Server is streamable-HTTP based and co-located at `/api/mcp`:

1. `list_drops()`: Public tool returning all live, coming-soon, and completed drops.
2. `get_drop_info(drop_id)`: Detailed spec, timing, and entry counts for a drop.
3. `enter_draw(drop_id, variant_id)`: Privileged entry tool verified via AgentKit signature.
4. `check_status(drop_id)`: Check entry status and winner allocation.
5. `purchase(entry_id)`: Trigger settlement payout on Monad Testnet.
6. `set_agent_strategy(...)`: Configure autonomous bidding budget, max item price, and min ROI % rules.
7. `get_active_listings()`: Query active A2A Claim NFT secondary listings on Monad.

---

## 5. Security & Anti-Sybil Invariants

1. **Unique Human Invariant**: The database enforces `UNIQUE (drop_id, human_key)` where `human_key` is derived from the World ID nullifier hash (for Web UI) or AgentKit human ID (for AI agents). Cross-path double entry is mathematically impossible.
2. **Stateless MCP Auth**: Per-request cryptographic SIWE signature verification on `/api/mcp` prevents session hijacking or replay attacks.
3. **Monad On-Chain Auditability**: All financial payouts and Claim NFT transfers generate verifiable transaction hashes on Monad Explorer (`https://testnet.monadexplorer.com`).

---

## 6. Technology Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4, shadcn/ui, Monad Cyber theme (`#836EF9`)
- **Blockchain**: Monad Testnet (Chain ID `10143`), `viem`, $MON, USDC
- **Identity**: World ID v4 (`@worldcoin/idkit`), World AgentKit (`@worldcoin/agentkit`)
- **Database**: PostgreSQL with Drizzle ORM
