// Remote MCP server (M7) — streamable-HTTP transport mounted as a Next route handler.
//
// Why a route handler: everything else in this app is here, so co-locating the MCP server
// keeps one backend + one deploy. We use the SDK's Web-Standard transport
// (WebStandardStreamableHTTPServerTransport) which speaks Web `Request`/`Response` — exactly
// what a Next App-Router route handler provides/returns, no Node req/res adapter needed.
//
// Statelessness: we run the transport in STATELESS mode (no sessionIdGenerator). Each POST
// builds a fresh McpServer + transport, connects, handles the one request, and tears down.
// That fits a route-handler/serverless model and, crucially, makes auth purely PER-REQUEST:
// every privileged tool call re-verifies the AgentKit signature from the live request headers
// (PRD M7 Option A — native per-request signature, no server session as source of truth).
//
// Tools:
//   list_drops()                  — open + coming-soon drops (public; informational)
//   get_drop_info(drop_id)        — one drop's details + this human's status if signed (public)
//   enter_draw(drop_id, variant)  — PRIVILEGED: AgentKit-verified humanId → one entry per drop
//   check_status(drop_id)         — PRIVILEGED: this human's entry status for the drop
//
// ⚠️ Next 16 carryovers: @/lib/db is a lazy proxy (connects on first use); build must pass
// `env -u DATABASE_URL pnpm build` (no env at module load — all DB access is inside handlers).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import {
  listDrops,
  getDropWithVariants,
  type DropWithVariants,
} from "@/lib/drops.service";
import {
  insertAgentEntry,
  findEntryByHumanKey,
  countDropEntries,
  AlreadyEnteredError,
} from "@/lib/entries.service";
import {
  authenticateAgent,
  AgentkitAuthError,
  AGENTKIT_HEADER,
  type AgentIdentity,
} from "@/lib/agentkit-auth";
import { authorizeOnBehalf, NoSignedInHumanError, UnauthorizedAgentError } from "@/lib/delegate.service";
import {
  purchaseForEntry,
  NotAWinnerError,
  WindowExpiredError,
  AlreadyPurchasedError,
} from "@/lib/draw.service";
import { getDrop } from "@/lib/drops.service";
import { dropTiming } from "@/lib/lifecycle.service";
import { getWalletByAddress, getReceiverAddress } from "@/lib/wallets";
import { InsufficientFundsError } from "@/lib/settlement.service";
import {
  setAgentStrategy,
  getMarketListings,
  summarizeMarket,
  listClaimForResale,
  buyClaimListing,
} from "@/lib/a2a.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // agentkit-core uses viem/siwe + node crypto; not edge-safe.

// ---- Tool result helpers ----------------------------------------------------------------
// MCP tools return content blocks. We return both a human-readable text block AND a structured
// JSON block (as text) so an LLM client can read either. `isError: true` surfaces tool errors.
function ok(data: unknown, summary?: string) {
  const text = summary ? `${summary}\n\n${json(data)}` : json(data);
  return { content: [{ type: "text" as const, text }] };
}
function fail(message: string, extra?: unknown) {
  const text = extra ? `${message}\n\n${json(extra)}` : message;
  return { content: [{ type: "text" as const, text }], isError: true };
}
function json(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

// Shape a drop for agent consumption (no internal seed/receiver leakage).
function publicDrop(d: DropWithVariants) {
  // Derived SNKRS-phase view so an agent can answer "when does it open / how long left to enter":
  //   coming_soon → seconds_until_open ("launches in"); open → seconds_until_close ("entries close in").
  const t = dropTiming(d);
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    phase: t.phase, // coming_soon | open | closing | drawn
    price_usdc: d.priceUsdc,
    total_slots: d.totalSlots,
    opens_at: d.opensAt,
    closes_at: d.closesAt,
    drawn_at: d.drawnAt,
    seconds_until_open: t.secondsUntilOpen, // for coming_soon
    seconds_until_close: t.secondsUntilClose, // for open
    variants: d.variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku })),
  };
}

// Resolve the agent identity for a privileged tool call from the live request headers, or
// throw an AgentkitAuthError (the tool maps it to a 402-style challenge result).
async function requireAgent(req: Request): Promise<AgentIdentity> {
  const identity = await authenticateAgent(req);
  const ctx = await authorizeOnBehalf(identity.walletAddress);
  return { ...identity, humanId: ctx.humanKey, agentBookResolved: true };
}

function failPrivilegedAuth(err: unknown) {
  if (err instanceof AgentkitAuthError) {
    return fail(`402 — AgentKit signature required. ${err.message}`, {
      error: "payment_required",
      code: err.code,
      hint: `Send a base64 AgentKit payload in the '${AGENTKIT_HEADER}' header (SIWE-signed by your wallet).`,
    });
  }
  if (err instanceof NoSignedInHumanError || err instanceof UnauthorizedAgentError) {
    return fail(err.message);
  }
  return null;
}

// Build a fresh MCP server with all tools bound to THIS request (so privileged tools can read
// the AgentKit signature header off the live request).
function buildServer(req: Request): McpServer {
  const server = new McpServer(
    { name: "krypton-drop-mcp", version: "1.0.0" },
    {
      instructions:
        "KryptonDrop: a high-speed bot-proof scarce-goods drop platform on Monad Testnet. " +
        "Use list_drops / get_drop_info to browse drops. " +
        "enter_draw, check_status, set_agent_strategy, and purchase are available to AI agents. " +
        "Winners settle payouts on Monad Testnet.",
    },
  );

  // --- list_drops (public) ---------------------------------------------------------------
  server.registerTool(
    "list_drops",
    {
      title: "List drops",
      description:
        "List all drops (open + coming-soon) with their variants, price (USDC), slot count, " +
        "and timing. No authentication required — informational.",
      inputSchema: {},
    },
    async () => {
      const drops = await listDrops();
      return ok(
        { drops: drops.map(publicDrop) },
        `${drops.length} drop(s).`,
      );
    },
  );

  // --- get_drop_info (public; coming-soon informational tool) -----------------------------
  server.registerTool(
    "get_drop_info",
    {
      title: "Get drop info",
      description:
        "Get full details for one drop by id: status, variants, price, when it opens/closes, " +
        "and how many unique humans have entered. Works for coming-soon drops too. If an " +
        `AgentKit signature ('${AGENTKIT_HEADER}') is present, also returns YOUR entry status.`,
      inputSchema: { drop_id: z.string().describe("The drop id (uuid) to inspect.") },
    },
    async ({ drop_id }) => {
      const drop = await getDropWithVariants(drop_id);
      if (!drop) return fail(`drop ${drop_id} not found`);
      const entered = await countDropEntries(drop_id);

      // Best-effort: if the caller signed, include their own status — but never require it here.
      let yourEntry: { status: string; source: string } | null = null;
      try {
        const id = await requireAgent(req);
        const mine = await findEntryByHumanKey(drop_id, id.humanId);
        if (mine) yourEntry = { status: mine.status, source: mine.source };
      } catch {
        // unsigned / invalid — fine, this tool is informational.
      }

      return ok(
        {
          ...publicDrop(drop),
          unique_humans_entered: entered,
          your_entry: yourEntry,
        },
        `${drop.name} — ${drop.status} — ${entered} unique human(s) entered.`,
      );
    },
  );

  // --- enter_draw (PRIVILEGED) ------------------------------------------------------------
  server.registerTool(
    "enter_draw",
    {
      title: "Enter the draw",
      description:
        "Reserve a per-second GPU compute rental slot for a drop on behalf of your human. Requires an AgentKit per-request " +
        `signature in the '${AGENTKIT_HEADER}' header. Enforces ONE slot per verified human per ` +
        "drop — a second entry for the same human is rejected. Optionally pick a variant.",
      inputSchema: {
        drop_id: z.string().describe("The drop id (uuid) to enter."),
        variant: z
          .string()
          .optional()
          .describe("Variant name (e.g. 'Silver' / 'Black') or variant id. Optional."),
      },
    },
    async ({ drop_id, variant }) => {
      // 1) AgentKit per-request auth → verified wallet + humanId.
      let identity: AgentIdentity;
      try {
        identity = await requireAgent(req);
      } catch (err) {
        const denied = failPrivilegedAuth(err);
        if (denied) return denied;
        throw err;
      }

      // 2) The drop must exist and be open for entry.
      const drop = await getDropWithVariants(drop_id);
      if (!drop) return fail(`drop ${drop_id} not found`);
      if (drop.status !== "open") {
        return fail(`drop "${drop.name}" is ${drop.status}, not open for entries`);
      }

      // 3) Resolve an optional variant (by name, case-insensitive, or by id).
      let variantId: string | null = null;
      if (variant) {
        const v =
          drop.variants.find((x) => x.id === variant) ??
          drop.variants.find((x) => x.name.toLowerCase() === variant.toLowerCase());
        if (!v) {
          return fail(
            `variant "${variant}" not found for drop "${drop.name}"`,
            { available: drop.variants.map((x) => x.name) },
          );
        }
        variantId = v.id;
      }

      // 4) Insert through the dedupe funnel: UNIQUE(drop_id, human_key=humanId).
      try {
        const entry = await insertAgentEntry({
          dropId: drop_id,
          humanId: identity.humanId,
          variantId,
          walletAddress: identity.walletAddress, // settles its purchase if it wins (M8)
        });
        return ok(
          {
            entered: true,
            entry_id: entry.id,
            drop: drop.name,
            variant: variantId,
            human_id: identity.humanId,
            wallet: identity.walletAddress,
            agentbook_resolved: identity.agentBookResolved,
            source: "agent",
          },
          `Entered "${drop.name}" — one slot secured for this human.`,
        );
      } catch (err) {
        if (err instanceof AlreadyEnteredError) {
          // The Sybil guarantee firing: this human already holds the one slot.
          return ok(
            {
              entered: false,
              already_entered: true,
              drop: drop.name,
              human_id: identity.humanId,
            },
            `Already entered "${drop.name}" — one slot per human per drop. No second entry created.`,
          );
        }
        throw err;
      }
    },
  );

  // --- check_status (PRIVILEGED) ----------------------------------------------------------
  server.registerTool(
    "check_status",
    {
      title: "Check my entry status",
      description:
        "Check this human's entry status for a drop (pending / won / lost / purchased / " +
        `expired, or not entered). Requires an AgentKit signature in '${AGENTKIT_HEADER}'.`,
      inputSchema: { drop_id: z.string().describe("The drop id (uuid).") },
    },
    async ({ drop_id }) => {
      let identity: AgentIdentity;
      try {
        identity = await requireAgent(req);
      } catch (err) {
        const denied = failPrivilegedAuth(err);
        if (denied) return denied;
        throw err;
      }

      const drop = await getDropWithVariants(drop_id);
      if (!drop) return fail(`drop ${drop_id} not found`);
      const mine = await findEntryByHumanKey(drop_id, identity.humanId);
      return ok(
        {
          drop: drop.name,
          drop_status: drop.status,
          human_id: identity.humanId,
          entered: !!mine,
          entry_status: mine?.status ?? null,
          entry_id: mine?.id ?? null,
          purchase_deadline: mine?.purchaseDeadline ?? null,
        },
        mine
          ? `Your entry in "${drop.name}" is '${mine.status}'.`
          : `You have not entered "${drop.name}".`,
      );
    },
  );

  // --- purchase (PRIVILEGED — M8: end-to-end agent settlement) -----------------------------
  server.registerTool(
    "purchase",
    {
      title: "Purchase (winners only)",
      description:
        "If your human WON this drop's draw, settle the purchase: a REAL USDC transfer of the " +
        "drop price from your registered wallet to the merchant, on World Chain Sepolia (chain " +
        `4801). Requires an AgentKit signature in '${AGENTKIT_HEADER}'. Only valid for a 'won' ` +
        "entry within its purchase window; non-winners / expired / already-purchased are rejected. " +
        "Returns the on-chain tx hash + explorer link.",
      inputSchema: { drop_id: z.string().describe("The drop id (uuid) you won and want to buy.") },
    },
    async ({ drop_id }) => {
      // 1) AgentKit per-request auth → verified wallet + humanId.
      let identity: AgentIdentity;
      try {
        identity = await requireAgent(req);
      } catch (err) {
        const denied = failPrivilegedAuth(err);
        if (denied) return denied;
        throw err;
      }

      // 2) Find THIS human's entry for the drop (keyed by humanId via human_key).
      const entry = await findEntryByHumanKey(drop_id, identity.humanId);
      if (!entry) {
        return fail(`you have not entered this drop — nothing to purchase`, {
          drop_id,
          human_id: identity.humanId,
        });
      }

      const drop = await getDrop(drop_id);
      if (!drop) return fail(`drop ${drop_id} not found`);

      // 3) Resolve the signer SERVER-SIDE from the entry's stored wallet_address (set at
      //    enter_draw time = the agent's verified wallet). Keys never cross the wire. As a
      //    safety net, fall back to the freshly-verified wallet from this request's signature.
      const walletAddr = entry.walletAddress ?? identity.walletAddress;
      const signer = walletAddr ? getWalletByAddress(walletAddr) : undefined;
      if (!signer) {
        return fail(
          `no known demo wallet maps to ${walletAddr} — cannot sign the settlement`,
          { wallet_address: walletAddr },
        );
      }
      // The verified caller must own the entry's wallet (defense in depth: a signature from a
      // different wallet can't drive someone else's purchase).
      if (
        entry.walletAddress &&
        entry.walletAddress.toLowerCase() !== identity.walletAddress.toLowerCase()
      ) {
        return fail(`this entry settles from a different wallet than your signature`, {
          entry_wallet: entry.walletAddress,
          your_wallet: identity.walletAddress,
        });
      }

      const receiver = drop.receiverAddress || getReceiverAddress();

      // 4) Real on-chain settlement (M5 via M6 purchaseForEntry): won-window check, USDC transfer,
      //    entry → 'purchased', orders row linked. Map domain errors to tool failures.
      try {
        const result = await purchaseForEntry({
          entryId: entry.id,
          privateKey: signer.privateKey,
          receiverAddress: receiver,
        });
        return ok(
          {
            purchased: true,
            drop: drop.name,
            tx_hash: result.txHash,
            explorer_url: result.explorerUrl,
            amount_usdc: result.amountUsdc,
            order_id: result.orderId,
            from: signer.address,
            to: receiver,
            entry_id: entry.id,
            status: "purchased",
          },
          `Purchased "${drop.name}" — ${result.amountUsdc} USDC settled on chain 4801. tx ${result.txHash}`,
        );
      } catch (err) {
        if (err instanceof NotAWinnerError) {
          return fail(`not a winner: ${err.message}`, { entry_status: entry.status });
        }
        if (err instanceof WindowExpiredError) {
          return fail(`purchase window expired: ${err.message}`);
        }
        if (err instanceof AlreadyPurchasedError) {
          return fail(`already purchased: ${err.message}`);
        }
        if (err instanceof InsufficientFundsError) {
          return fail(`insufficient funds: ${err.message}`, { error: "insufficient_funds" });
        }
        throw err;
      }
    },
  );

  // Tool 6: set_agent_strategy (Public/Agent)
  server.tool(
    "set_agent_strategy",
    "Configure autonomous bidding budget, category targets, and ROI resale rules for an AI Agent.",
    {
      agent_id: z.string().describe("Unique identifier of the AI agent"),
      max_budget_usdc: z.number().positive().describe("Maximum total budget in USDC"),
      max_item_price_usdc: z.number().positive().describe("Maximum price per item drop in USDC"),
      min_roi_percent: z.number().nonnegative().describe("Minimum required resale ROI % to enter drop"),
      auto_resale_on_win: z.boolean().describe("Whether to automatically list won claim NFTs on Monad DEX"),
    },
    async ({ agent_id, max_budget_usdc, max_item_price_usdc, min_roi_percent, auto_resale_on_win }) => {
      const strategy = setAgentStrategy({
        agentId: agent_id,
        maxBudgetUsdc: max_budget_usdc,
        maxItemPriceUsdc: max_item_price_usdc,
        minRoiPercent: min_roi_percent,
        autoResaleOnWin: auto_resale_on_win,
        targetCategories: ["GPUs", "Hardware", "Sneakers"],
      });
      return ok(strategy, `Configured strategy for agent "${agent_id}": Max item $${max_item_price_usdc}, Min ROI ${min_roi_percent}%.`);
    }
  );

  // Tool 7: get_active_listings (Public)
  server.tool(
    "get_active_listings",
    "List A2A marketplace vouchers from the shared database (LISTED and SOLD). Buy only listings with status LISTED.",
    {},
    async () => {
      const market = summarizeMarket(await getMarketListings());
      return ok(
        { ...market, count: market.listings.length },
        `Marketplace: ${market.for_sale_count} for sale, ${market.sold_count} sold.`
      );
    }
  );

  return server;
}

// One stateless request/response cycle: build server + transport, connect, handle, tear down.
async function handle(req: Request): Promise<Response> {
  const server = buildServer(req);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // STATELESS — auth is per-request, not per-session.
    enableJsonResponse: true, // return a single JSON response (no SSE) for simple clients.
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Best-effort teardown so the per-request server/transport don't leak.
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

// GET is used by some clients to open an SSE stream; in stateless mode there's no stream to
// resume, so the transport returns the appropriate 405/406. DELETE ends a session (no-op here).
export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(req);
}
