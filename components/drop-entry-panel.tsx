"use client";

// Client wrapper that holds the selected variant and renders the World ID entry + winner
// purchase flow (M9). Variant chips are brutalist toggle pills.
import { useState } from "react";
import { WorldIdEntry } from "@/components/world-id-entry";

interface VariantLite {
  id: string;
  name: string;
}

export function DropEntryPanel({
  dropId,
  variants,
  open,
}: {
  dropId: string;
  variants: VariantLite[];
  open: boolean;
}) {
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);

  return (
    <div className="flex flex-col gap-5">
      {variants.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
            Choose a finish
          </span>
          <div className="flex flex-wrap gap-3">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                className={
                  "border-[3px] border-ink px-5 py-2 text-sm font-extrabold uppercase transition-all " +
                  (variantId === v.id
                    ? "bg-ink text-cream"
                    : "bg-white text-ink hover:bg-lime")
                }
                aria-pressed={variantId === v.id}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <WorldIdEntry dropId={dropId} variantId={variantId} disabled={!open} />
    </div>
  );
}
