// Drop detail page (M9) — pop-brutalist drop-campaign layout.
// Big product block, fairness stat block (the visible Sybil proof), variant chips, and the
// full World ID entry → draw → winner-purchase flow. Server component: reads the DB directly.
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDropWithVariants } from "@/lib/drops.service";
import { countDropEntries } from "@/lib/entries.service";
import { getDrawState } from "@/lib/draw.service";
import { DropEntryPanel } from "@/components/drop-entry-panel";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function DropPage({ params }: Params) {
  const { id } = await params;
  const drop = await getDropWithVariants(id);
  if (!drop) notFound();

  const entryCount = await countDropEntries(id);
  // Cross-surface breakdown (M9 step 5): web vs agent entries on the same drop.
  const drawState = await getDrawState(id);
  const allEntries = [
    ...drawState.pending,
    ...drawState.winners,
    ...drawState.losers,
    ...drawState.purchased,
  ];
  const webCount = allEntries.filter((e) => e.source === "web").length;
  const agentCount = allEntries.filter((e) => e.source === "agent").length;
  const drawn = !!drop.drawnAt;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 py-8 sm:px-8">
      <header className="flex items-center justify-between border-b-[3px] border-ink pb-4">
        <Link href="/" className="display text-lg sm:text-xl">
          ← KRYPTON·DROP
        </Link>
        <span className="pill bg-lime">Monad Testnet (10143)</span>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
        {/* Product block — chunky campaign image surrogate. */}
        <div className="brutal flex aspect-square flex-col items-center justify-center gap-4 bg-lime p-8">
          <span className="display text-center text-6xl leading-[0.88] sm:text-7xl">
            {drop.name}
          </span>
          <span className="pill">{drop.status.replace("_", " ")}</span>
        </div>

        {/* Details + entry */}
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
              Limited drop · {drop.totalSlots} slot{drop.totalSlots === 1 ? "" : "s"}
            </span>
            <h1 className="display text-6xl sm:text-7xl">{drop.name}</h1>
            <div className="flex items-end gap-3">
              <span className="display text-5xl">{drop.priceUsdc} MON</span>
              <span className="pb-1 text-sm font-extrabold uppercase text-muted-foreground">
                MON · one entry per verified human
              </span>
            </div>
          </div>

          {/* Fairness panel — bold stat block, the visible Sybil-guarantee proof. */}
          <div className="brutal flex flex-col gap-4 p-5">
            <div className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
              Fairness · one slot per human
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="border-[3px] border-ink p-3">
                <div className="display text-4xl">{entryCount}</div>
                <div className="text-[10px] font-bold uppercase">unique humans</div>
              </div>
              <div className="border-[3px] border-ink p-3">
                <div className="display text-4xl">{webCount}</div>
                <div className="text-[10px] font-bold uppercase">web · World ID</div>
              </div>
              <div className="border-[3px] border-ink p-3">
                <div className="display text-4xl">{agentCount}</div>
                <div className="text-[10px] font-bold uppercase">agent · AgentKit</div>
              </div>
            </div>
            <p className="text-xs font-medium">
              Web + agent entries hit the same{" "}
              <code className="font-mono font-bold">UNIQUE(drop, human)</code> gate. Duplicate
              entries are blocked at the database. {drawn ? "Drawn." : "Draw pending."}
            </p>
          </div>

          <DropEntryPanel
            dropId={drop.id}
            variants={drop.variants.map((v) => ({ id: v.id, name: v.name }))}
            open={drop.status === "open"}
          />
        </div>
      </div>
    </div>
  );
}
