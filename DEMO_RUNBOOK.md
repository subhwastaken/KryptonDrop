# DEMO_RUNBOOK.md — KryptonDrop (Live Monad Hackathon Demo Guide)

> **The Live Judge Demo Script**: Timers are genuinely time-driven — you set them once and the server's own clock opens entries and executes the draw on **Monad Testnet**. 
> Human verification uses **World ID v4**, while AI Agents connect via **Model Context Protocol (MCP)** using **World AgentKit** credentials.

---

## ⚡ The One-Paragraph Pitch

**KryptonDrop** is a high-speed, bot-proof trustless per-second GPU compute rental platform built natively for **Monad**. Scarce compute clusters (NVIDIA H100 SXM5, Blackwell B200 Superclusters) are allocated **one rental slot per verified human per compute drop**. Two surfaces hit one backend: a **web app** (humans verify with World ID v4) and a **remote MCP server** (AI agents enter/trade on behalf of verified humans using AgentKit proofs). When the countdown hits zero, the server draws a winner via CSPRNG and settles instant payouts on **Monad Testnet (Chain ID 10143)**. Winning AI agents can automatically list Claim NFTs on the secondary A2A DEX with automated profit splitting!

---

## 📍 Live Coordinates & Network Parameters

| Component | Value |
|---|---|
| **Platform Name** | KryptonDrop |
| **Public repo** | [github.com/subhwastaken/KryptonDrop](https://github.com/subhwastaken/KryptonDrop) |
| **Network** | Monad Testnet (Chain ID `10143`) |
| **RPC Endpoint** | `https://testnet-rpc.monad.xyz` |
| **Monad Explorer** | `https://testnet.monadexplorer.com` |
| **ComputeClaimNFT** | [`0x7af7C765F53fac5C6B95FC099f75E8B2b35bCb64`](https://testnet.monadscan.com/address/0x7af7C765F53fac5C6B95FC099f75E8B2b35bCb64) |
| **MonadScan (live contract page)** | [testnet.monadscan.com/address/0x7af7C765…b35bCb64](https://testnet.monadscan.com/address/0x7af7C765F53fac5C6B95FC099f75E8B2b35bCb64) |
| **MCP Server Route** | `http://localhost:3000/api/mcp` (or deployed URL `/api/mcp`) |
| **MCP Available Tools** | `list_drops`, `get_drop_info`, `enter_draw`, `check_status`, `purchase`, `set_agent_strategy`, `get_active_listings` |

---

## 📋 Pre-Demo Checklist (~10 Seconds)

1. **Verify Dev Server**: Ensure local app is running on `http://localhost:3000`.
2. **Verify Database Connection**: Run `pnpm exec tsx scripts/check-balances.ts` to confirm Monad RPC connectivity.
3. **Verify MCP Route**: Open `http://localhost:3000/api/mcp` in your browser or MCP inspector.

---

## 🎬 Live 3-Act Demo Script (3-Minute Pitch)

### Act 1: The Human Experience (60s)
1. **Showcase the Landing Page**: Point out the **Monad Cyber Aesthetic**, live network badges (`10,000 TPS · 1s Finality`), and active drops (Nvidia RTX 5090 GPU / Mac Mini).
2. **Human Entry**: Navigate to an open drop page. Click **"Verify with World ID"**.
3. **Zero-Knowledge Proof**: Scan the World ID QR code with your phone. The backend verifies the ZK proof and confirms: **1 slot allocated for 1 verified human**.

---

### Act 2: The Autonomous AI Agent Experience (60s)
1. **Connect MCP Client**: Connect Claude Desktop or Cursor to `http://localhost:3000/api/mcp`.
2. **Set Agent Bidding Strategy**: Prompt Claude:
   > *"Configure KryptonDrop strategy: set budget to $1,000, max item price $900, minimum ROI 25%, auto resale enabled."*
3. **Agent Entry**: Claude calls `set_agent_strategy` and `enter_draw` via MCP, attaching the user's AgentKit proof-of-humanity.

---

### Act 3: Monad Sub-Second Draw & Instant A2A Resale (60s)
1. **The Countdown Hits 00:00**:
   - The server draws a winner using CSPRNG.
   - Payout settlement executes on **Monad Testnet** with sub-second finality.
2. **Instant A2A Resale**:
   - If the winning agent has `auto_resale_on_win: true`, it automatically mints a **Claim NFT** and lists it on the A2A marketplace (`get_active_listings`).
   - A buyer agent accepts the listing $\rightarrow$ Monad settles the transfer $\rightarrow$ **90% profit transferred directly to human owner's wallet!**

---

## 💡 Key Highlights for Judges

- **Monad High Throughput**: Demonstrates Monad's 10,000 TPS parallel EVM execution without gas spikes during rush drops.
- **Proof-of-Humanity Gating**: Eliminates multi-account bot farms while empowering legitimate AI agents.
- **A2A Economy**: Turns physical drop vouchers into instantly liquid Monad Claim NFTs.
