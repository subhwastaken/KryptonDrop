// /win/[entryId] — the standalone, screenshottable winner page (M12). One page that BOTH
// surfaces converge on (the inline web flow links here; the agent path can be shown here too),
// because POST /api/drops/:id/purchase resolves the winner's wallet server-side from the entry
// — so it works for whoever wins (human OR agent).
//
// States (read from the real entry status — never faked):
//   • won       → product + finish + "YOU WON ✦ / PURCHASE — pay USDC" CTA (client island)
//   • purchased → "PURCHASED ✓" + amount + real explorer tx link + hash
//   • lost      → honest "not selected" + link home
//   • expired   → honest "window expired" + link home
//   • pending   → "awaiting the draw" + link home
//   • not found → 404
//
// Real USDC, real tx — the purchase island calls the same settlement route as everything else.

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  getEntryById,
  getConfirmedOrderForEntry,
} from "@/lib/entries.service";
import { getDropWithVariants } from "@/lib/drops.service";
import { presentationFor } from "@/lib/drops.presentation";
import { explorerTxUrl } from "@/lib/chain";
import WinnerPurchase from "@/components/winner-purchase";

export const dynamic = "force-dynamic";

export default async function WinnerPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;

  // entryId is a uuid; a malformed value would make the DB query throw (invalid uuid syntax).
  // Treat anything not shaped like a uuid as not-found rather than 500-ing.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(entryId)) notFound();

  const entry = await getEntryById(entryId);
  if (!entry) notFound();

  const drop = await getDropWithVariants(entry.dropId);
  if (!drop) notFound();

  const presentation = presentationFor(drop.name);
  const variant = entry.variantId
    ? drop.variants.find((v) => v.id === entry.variantId)
    : undefined;
  const variantName = variant?.name ?? null;

  // Photo: the finish-specific shot if known, else the default.
  const photo =
    (presentation &&
      variantName &&
      presentation.photo.byVariant?.[variantName]) ||
    presentation?.photo.default ||
    null;

  const accent = presentation?.accent ?? "bg-lime";
  const price = Number(drop.priceUsdc).toFixed(0);

  // For an already-purchased entry, surface its real settlement tx.
  const order =
    entry.status === "purchased"
      ? await getConfirmedOrderForEntry(entry.id)
      : undefined;

  return (
    <main className="min-h-[100svh] px-5 py-8 sm:px-8">
      {/* Top bar */}
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b-[3px] border-ink pb-4 text-xs font-extrabold uppercase">
        <Link href="/" className="display text-lg sm:text-xl">
          KRYPTON·DROP
        </Link>
        <span className="pill bg-lime">Monad Testnet · Per-Second Compute</span>
      </header>

      <div className="mx-auto grid max-w-5xl flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        {/* Product photo */}
        <div className="order-2 flex items-center justify-center lg:order-1">
          <div className="brutal relative aspect-square w-full max-w-[30rem] overflow-hidden bg-white">
            <div
              className={`absolute inset-x-0 top-0 h-2.5 border-b-[3px] border-ink ${accent}`}
            />
            {photo && (
              <Image
                src={photo}
                alt={`${drop.name}${variantName ? ` — ${variantName}` : ""}`}
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-contain p-10"
              />
            )}
          </div>
        </div>

        {/* State block */}
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
              {entry.source === "agent" ? "Agent winner" : "Human winner"}
              {variantName ? ` · ${variantName} finish` : ""}
            </span>
            <h1 className="display text-5xl leading-[0.92] sm:text-6xl">
              {drop.name}
            </h1>
            <div className="flex items-end gap-3">
              <span className="display text-4xl">${price}</span>
              <span className="pb-1 text-sm font-extrabold uppercase text-muted-foreground">
                USDC
              </span>
            </div>
          </div>

          {entry.status === "won" && (
            <WinnerPurchase
              dropId={drop.id}
              entryId={entry.id}
              priceUsdc={price}
              purchaseDeadline={entry.purchaseDeadline?.toISOString() ?? null}
            />
          )}

          {entry.status === "purchased" && (
            <WinnerPurchase
              dropId={drop.id}
              entryId={entry.id}
              priceUsdc={price}
              initialTxHash={order?.txHash ?? null}
              initialExplorerUrl={order?.txHash ? explorerTxUrl(order.txHash) : null}
            />
          )}

          {entry.status === "lost" && (
            <div className="brutal flex flex-col gap-2 p-6">
              <div className="display text-4xl">NOT SELECTED</div>
              <p className="text-sm font-medium">
                This drop was drawn — you weren&apos;t selected this time. The
                draw was a fair CSPRNG over every verified human who entered.
              </p>
            </div>
          )}

          {entry.status === "expired" && (
            <div className="brutal flex flex-col gap-2 p-6">
              <div className="display text-4xl">WINDOW EXPIRED</div>
              <p className="text-sm font-medium">
                Your purchase window closed before the slot was claimed.
              </p>
            </div>
          )}

          {entry.status === "pending" && (
            <div className="brutal flex flex-col gap-2 p-6">
              <div className="display text-4xl">YOU&apos;RE IN ✓</div>
              <p className="text-sm font-medium">
                One slot reserved for this verified human. The draw runs
                automatically when entries close — check back then.
              </p>
            </div>
          )}

          <Link
            href="/"
            className="text-sm font-extrabold uppercase underline underline-offset-4"
          >
            ← Back to drops
          </Link>
        </div>
      </div>
    </main>
  );
}
