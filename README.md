# ⚡ KryptonDrop

**Trustless Per-Second GPU Compute Rentals & Autonomous Agent-to-Agent (A2A) Allocation on Monad**

KryptonDrop is a high-performance, bot-proof trustless per-second GPU compute rental platform built natively for the **Monad ecosystem**. When high-demand GPU clusters (NVIDIA H100 SXM5, Blackwell B200 Superclusters) sell out in milliseconds, the bottleneck isn't compute availability—it's Sybil verification and execution throughput. 

**KryptonDrop** enforces **one GPU rental allocation per verified human per compute drop**, settled with sub-second finality on Monad Testnet, with full support for autonomous AI agent bidding and secondary Agent-to-Agent (A2A) claim trading.

---

## 📖 Table of Contents
1. [Key Features](#-key-features)
2. [How It Works (Under the Hood)](#-how-it-works-under-the-hood)
3. [System Architecture](#-system-architecture)
4. [Tech Stack](#-tech-stack)
5. [Directory Layout](#-directory-layout)
6. [Prerequisites](#-prerequisites)
7. [Step-by-Step Installation & Setup](#-step-by-step-installation--setup)
8. [Running the Application](#-running-the-application)
9. [The Drop Lifecycle & State Machine](#-the-drop-lifecycle--state-machine)
10. [Model Context Protocol (MCP) API Reference](#-model-context-protocol-mcp-api-reference)
11. [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## ✨ Key Features

- **Sybil-Proof Gating (Proof-of-Humanity)**: 
  - **Web UI**: Integrates **World ID v4 Zero-Knowledge Proofs** to verify users. Once signed in, humans can claim slots with a single tap (no redundant scans).
  - **AI Agent (MCP)**: Authenticates agents via **World AgentKit** signatures.
  - **Deduplication**: Enforces a strict `UNIQUE(drop_id, human_key)` constraint at the database level. It is mathematically impossible for a user to enter the same drop twice, even if they switch between the web interface and an autonomous AI agent.
- **⚡ The Monad Advantage**:
  - **Zero Network Congestion**: Harnesses Monad's **10,000 TPS parallel EVM execution engine** to handle drop rushes without gas spikes.
  - **Instant Settlement**: Winner draws and reward transfers execute instantly with **1-second block finality** on the Monad Testnet.
  - **Native Token Mechanics**: Uses native MON ($MON) for settlements.
- **Model Context Protocol (MCP) Server**: Exposes tools co-located with the Next.js backend at `/api/mcp` (or via local Stdio transport) allowing AI agents (like Claude or Cursor) to autonomously browse, enter, check, and settle purchases on behalf of verified humans.
- **Agent-to-Agent (A2A) Secondary Market**: AI agents can list winning Claim NFT vouchers on a secondary DEX. Buyer agents can purchase them, and the smart contracts/database route **90% of the resale profit directly back to the seller human's wallet** (with 10% kept by the agent/marketplace).
- **Time-Driven Autonomous Server Ticker**: Runs an autonomous background heartbeat (ticking every ~5 seconds) that transitions drops through their lifecycles (`coming_soon` ➔ `open` ➔ `closed`/`drawn` ➔ `settled`) based on the server's wall clock, independent of any user interaction.

---

## 🧠 How It Works (Under the Hood)

1. **Staging**: Drops (e.g., NVIDIA H100 SXM5 Cluster) are seeded in the database. Initially, they are `coming_soon` with a countdown to the `opensAt` timestamp.
2. **Verification & Entry**:
   - **Humans** sign in with World ID in the browser. The backend verifies the ZK proof with World's v4 Cloud RP verify endpoint, yielding a unique `nullifier_hash` which acts as their `human_key`.
   - **AI Agents** SIWE-sign a per-request header containing CAIP-122 parameters. The backend verifies the signature on-chain, resolves the wallet address to a human ID (via World Chain AgentBook, falling back to a wallet-scoped ID for local demo testing), and checks that this wallet is authorized by the active web-signed-in human.
3. **The Draw**: When the countdown hits zero, the server's background ticker runs `runDraw`. It queries all `pending` entries and ranks them. For demo predictability, it can use a static `drawSeed`; otherwise, it uses a secure cryptographic pseudorandom number generator (CSPRNG). Winners are marked `won` with a 10-minute payment deadline, while others are marked `lost`.
4. **On-Chain Settlement**: The winning user or their agent calls `purchase`. The server builds and signs an on-chain transaction that transfers the drop price (in MON) to the merchant wallet on **Monad Testnet (Chain ID 10143)**. The transaction is awaited, confirmed, and an audited order row is stored.
5. **Secondary Trading**: If configured, the winning agent can autonomously list the Claim NFT on the secondary A2A market. Another agent can call the secondary buy API, which handles the split payouts on Monad.

---

## 📊 System Architecture

```
                                +----------------------------------+
                                |      Human User (Web Browser)    |
                                +----------------+-----------------+
                                                 |
                                                 | World ID v4 ZK Proof
                                                 v
                                    +------------+------------+
                                    |   Next.js Web Frontend  |
                                    +------------+------------+
                                                 |
                                                 | API / JSON / Sessions
                                                 v
  +----------------------+          +------------+------------+          +-------------------------+
  |    AI Agent (LLM)    +--------->|   MCP Server Endpoint   |<---------+   World Chain AgentBook |
  | (Claude/Cursor Client)          |     (/api/mcp or Stdio) |          | (Wallet -> humanId map) |
  +----------------------+  AgentKit+------------+------------+          +-------------------------+
                             SIWE                |
                                                 | Drizzle ORM
                                                 v
                                    +------------+------------+
                                    |    PostgreSQL Database  |
                                    | UNIQUE(drop, human_key) |
                                    +------------+------------+
                                                 |
                                                 | Viem Client (Chain 10143)
                                                 v
                                    +------------+------------+          +-------------------------+
                                    |      Monad Testnet      +--------->|  Monad Block Explorer   |
                                    |   (1s Block Finality)   |          |  (Explorer Audit Tx)    |
                                    +-------------------------+          +-------------------------+
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js 16** (App Router), React 19, TypeScript | Reactive, server-rendered core |
| **Styling & Aesthetics** | **Tailwind CSS v4**, shadcn/ui | Monad Cyber Purple themed visual layout |
| **Identity / ZKP** | **World ID v4** (`@worldcoin/idkit`), World AgentKit | Anti-Sybil human verification |
| **Agent Transport** | **Model Context Protocol (MCP)** SDK | Bridges LLMs with local server tools |
| **Smart Blockchain** | **Viem**, $MON (Monad Testnet Chain ID `10143`) | Sub-second settlement & transactions |
| **Database ORM** | **PostgreSQL** via **Drizzle ORM** | Dedicated relational data store |
| **Runner Environment** | **Docker** (Multi-stage build) | High-performance container deployment |

---

## 📂 Directory Layout

```
├── app/                       # Next.js App Router root
│   ├── [slug]/                # Catch-all deep-linked panels (e.g. /h100-cluster)
│   ├── admin/                 # Admin panel to force transitions, trigger draws, and inspect database state
│   ├── api/                   # REST API routes
│   │   ├── auth/              # World ID sign-in, session caches, and sign-out handlers
│   │   ├── drops/             # Drop entry, entry-status polling, and purchase handlers
│   │   └── mcp/               # Streams-based HTTP MCP Server handler (stateless transport)
│   ├── globals.css            # Global CSS styling
│   └── page.tsx               # Main application entrance point
│
├── components/                # Reusable React components
│   ├── ui/                    # Raw style components (buttons, badges)
│   ├── drop-deck.tsx          # Assembles the full page scroll deck of all drops
│   ├── item-panel.tsx         # Layout, specs, and World ID verification actions for an individual drop
│   ├── session-provider.tsx   # React context manager wrapping World ID IDKit widget
│   └── world-id-entry.tsx     # Handles entry submissions, polling, and purchase settle buttons
│
├── lib/                       # Backend service & helper layer
│   ├── db/                    # Database client registry, migrations, and schemas
│   │   ├── schema.ts          # Core PostgreSQL tables (drops, variants, entries, orders, agents)
│   │   └── index.ts           # Lazy connection initializer (prevents database load during build)
│   ├── a2a.service.ts         # Agent-to-Agent resale market and strategic budget evaluations
│   ├── chain.ts               # Viem client configuration & Monad network definitions
│   ├── delegate.service.ts    # Links verified World ID human sessions to authorized agent wallets
│   ├── draw.service.ts        # Random/seeded draw ranking, winner allocations, and payment deadlines
│   ├── drops.service.ts       # Drop creation, offsets, resets, and query services
│   ├── entries.service.ts     # Querying entries, deduplication, and database insertions
│   ├── lifecycle.service.ts   # Core clock state machine (opens/draws drops automatically)
│   ├── lifecycle.ticker.ts    # Background loop ticking transitions every ~5 seconds
│   ├── settlement.service.ts  # Token balance checking and transaction settlements on Monad
│   └── wallets.ts             # Demo wallet mapping (private keys are secured on the server)
│
├── scripts/                   # CLI scripts for demo configurations & testing
│   ├── agent-bot.ts           # Runs an autonomous AI bot bidding loop simulating a user agent
│   ├── check-balances.ts      # Fast check of Monad Testnet wallet balances (gas & MON)
│   ├── launch-demo.ts         # Demolishes previous entries & seeds drops with fresh relative count-downs
│   ├── mcp-stdio-server.ts    # Local Stdio fallback version of the MCP Server
│   └── setup-claude-mcp.ts    # Script to configure Claude Desktop's config file automatically
│
├── Dockerfile                 # Standalone Docker build definition
├── package.json               # Dependencies and scripts manager
└── pnpm-lock.yaml             # Strict package lockfile
```

---

## 📋 Prerequisites

Make sure you have installed the following on your system before setting up KryptonDrop:
1. **Node.js**: Version `22.20.0` or higher.
2. **PNPM**: Package manager version `10.18.1` or higher.
3. **PostgreSQL**: A running instance (local or hosted on Neon.tech).
4. **Metamask/EVM Wallet**: Funded with testnet MON ($MON) on Monad Testnet. (Use the [Monad Testnet Faucet](https://faucet.monad.xyz/) to fund).

---

## 🛠️ Step-by-Step Installation & Setup

### Step 1: Clone and Install Dependencies
Navigate to your workspace directory and install the libraries:
```bash
pnpm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` into a new file named `.env`:
```bash
cp .env.example .env
```
Fill in the configuration details. Here is a breakdown of what each variable represents:
```ini
# Database Connection String
DATABASE_URL="postgresql://username:password@host/database?sslmode=require"

# Monad Testnet Settings
MONAD_TESTNET_RPC="https://testnet-rpc.monad.xyz"
MONAD_USDC_ADDRESS="0xf8a8321714965d02F680f4f9CDA66f2C07D7ef4F" # Mock Token address or native fallback

# Security Secret Hashes (Change for production)
ADMIN_SECRET="adminsecret-hackathon-2026"
SESSION_SECRET="sessionsecret-hackathon-2026"

# World ID Developer Credentials (obtain from developer.worldcoin.org)
WORLD_APP_ID="app_9499..."
NEXT_PUBLIC_WORLD_APP_ID="app_9499..."
WORLD_APP_RP_ID="rp_97fa..."
WORLD_APP_SIGNER_KEY="0x..." # Private signing key of the RP provider
NEXT_PUBLIC_WORLD_APP_ENVIRONMENT="staging" # Can be 'staging' or 'production'

# Demo Wallets Private Keys (for signing the transactions server-side)
# DO NOT expose private keys to the client!
DEMO_HUMAN_PK="0x..." # The wallet address representing the human browser user
DEMO_AGENT1_PK="0x..." # Authorized agent 1 private key
DEMO_AGENT2_PK="0x..." # Authorized agent 2 private key
RECEIVER_ADDRESS="0x..." # The merchant wallet that receives payment for the GPU compute

# Default Strategic Rules for Autonomous AI Agent Bidding
AGENT_MAX_BUDGET_USDC="1000"
AGENT_MAX_ITEM_PRICE_USDC="900"
AGENT_MIN_ROI_PERCENT="15"
AGENT_AUTO_RESALE="false"
```

### Step 3: Run Database Migrations
Generate the Drizzle schema and push it directly to your PostgreSQL database:
```bash
# Generate the SQL migration files
pnpm db:generate

# Push the schemas to the database
pnpm db:push
```

### Step 4: Seed the Database
Initialize the live drops (NVIDIA H100 and Blackwell clusters) and clear any lingering entries:
```bash
pnpm exec tsx scripts/launch-demo.ts
```

---

## 🚀 Running the Application

### 1. Start the Local Server
Launch the Next.js development server:
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. You will see the scroll deck showing active countdowns!

### 2. Run the Autonomous AI Agent Bot
To simulate an autonomous agent bidding, entering, and settling payment on a loop as the drop transitions, open a new terminal and run:
```bash
pnpm exec tsx scripts/agent-bot.ts
```
The agent bot will monitor the H100 Cluster drop, enter once it opens, wait for the draw, and automatically settle the transaction on Monad Testnet if it wins.

### 3. Connect to Claude Desktop (MCP)
To use the MCP server directly within Claude Desktop:
1. Run the automatic config script:
   ```bash
   pnpm exec tsx scripts/setup-claude-mcp.ts
   ```
2. Fully restart Claude Desktop. It will now have access to the local tools.
3. *Alternative (Manual Config)*: Add this to your Claude Desktop config JSON (`%appdata%/Claude/claude_desktop_config.json` on Windows):
   ```json
   {
     "mcpServers": {
       "krypton-drop": {
         "command": "npx",
         "args": [
           "tsx",
           "E:/Monad Hackathon/Proof-Of-Human-Drops/scripts/mcp-stdio-server.ts"
         ]
       }
     }
   }
   ```

---

## 🔄 The Drop Lifecycle & State Machine

Each drop progresses through a strict set of transitions driven by time:

```
  +--------------+               +--------+               +------------------+
  |  Coming Soon | ------------> |  Open  | ------------> | Closed / Drawn   |
  |  (Countdown) |   opensAt     | (Entry |   closesAt    | (Winner Elected  |
  +--------------+   reached     +--------+   reached     | Payment Window)  |
                                                          +--------+---------+
                                                                   |
                                                                   | purchase()
                                                                   | completed
                                                                   v
                                                          +------------------+
                                                          |     Settled      |
                                                          |  (GPU Allocated) |
                                                          +------------------+
```

1. **`coming_soon`**: The drop is announced. Users can view product specifications. Bidding is disabled.
2. **`open`**: The countdown completes. Web users verify with World ID. AI agents submit AgentKit payloads to enter the draw.
3. **`closed` / `drawn`**: Entries close. The engine chooses `total_slots` winners. A 10-minute purchase deadline is stamped.
4. **`settled` / `purchased`**: The winner settles payment on the Monad chain, transitioning the entry to `purchased` and securing the GPU cluster allocation. If the payment window lapses without action, the state turns to `expired`.

---

## 🔌 Model Context Protocol (MCP) API Reference

The stateless MCP server handles the following tools at `/api/mcp` and via Stdio:

| Tool Name | Scope | Description | Inputs |
| :--- | :--- | :--- | :--- |
| `list_drops` | Public | Lists all drops, pricing, variants, and phase countdowns. | None |
| `get_drop_info` | Public | Returns details on one drop + user entry status if signed. | `drop_id` (string) |
| `enter_draw` | Privileged | Enters a verified human slot into the draw. Deduplicates automatically. | `drop_id` (string), `variant` (string, optional) |
| `check_status` | Privileged | Returns current entry status (`pending`, `won`, `lost`, `purchased`). | `drop_id` (string) |
| `purchase` | Privileged | Settles the $MON transaction on Monad Testnet for a winning entry. | `drop_id` (string) |
| `set_agent_strategy` | Agent | Configures bidding budgets, caps, and auto-resale rules for an AI Agent. | `agent_id` (string), budget parameters |
| `get_active_listings` | Public | Fetches all A2A Claim NFT listings on the secondary market. | None |

> **Authentication Note**: Privileged tools require the agent to send a valid, base64-encoded SIWE-signed payload in the `x-agentkit-payload` header.

---

## ❓ Troubleshooting & FAQs

### Q1: The transaction fails with `Insufficient Funds`
- Ensure that the wallet keys configured in `.env` (`DEMO_HUMAN_PK`, `DEMO_AGENT1_PK`, etc.) have enough testnet MON to cover the transaction value and network gas fees. Get MON from the faucet.

### Q2: How can I force-draw a drop during a live presentation?
- You don't have to wait for the countdown! Log in as an administrator on the dashboard or use the admin routing (`/admin`) to skip the timer and trigger the draw immediately.

### Q3: My agent cannot call privileged tools
- The agent must be authorized by a human session. Ensure you have signed in with World ID in the browser first. This binds the human session to the mock agent wallet (`agent1` / `agent2`), allowing the MCP server to authorize on-behalf execution.

### Q4: The Next.js build fails because of database variables
- Database client connections in `lib/db/index.ts` are created lazily. If the database is missing at build time, run the build command omitting the database url: `env -u DATABASE_URL pnpm build`.

---
*Built with ❤️ for the Monad Hackathon 2026.*
