// Demo seed (M3 / M11): the two live drops — Mac Mini + GeForce RTX 5090.
//
// SNKRS-style staging (M14): each drop is seeded as `coming_soon` with a future `opens_at`
// and a `closes_at` = opens_at + entry window. The real M11 lifecycle clock then drives the
// whole flow with zero admin input:
//   LAUNCHING IN <opens_at> → (auto) ENTRIES CLOSE IN <closes_at> → (auto) draw → WON / SOLD OUT.
// Launch offsets are staggered so both timers are visible at once and open during a demo.
//
// IMPORTANT (M11): each drop's World ID v4 action (`drop_<uuid>`) is registered in the
// Developer Portal against that drop's UUID. So we do NOT blow drops away — that would mint
// new UUIDs whose actions aren't registered, breaking the live entry flow. Instead we
// UPSERT in place, preserving each drop's id + worldActionId.
// On a fresh DB (no rows) it falls back to creating both cleanly.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { drops, variants } from "@/lib/db/schema";
import {
  createDrop,
  findDropByName,
  stagingFor,
  type DropWithVariants,
} from "@/lib/drops.service";
import { getDropWithVariants } from "@/lib/drops.service";

const H100_CLUSTER = "NVIDIA H100 SXM5 Cluster";
const B200_SUPERCLUSTER = "NVIDIA Blackwell B200 Supercluster";
const MAC_MINI = "Mac Mini"; // legacy name to migrate
const RTX_5090 = "GeForce RTX 5090"; // legacy name to migrate
const MAC_STUDIO = "Mac Studio"; // legacy name to migrate

async function replaceVariants(
  dropId: string,
  rows: Array<{ name: string; sku: string; stock: number }>,
): Promise<void> {
  await db.delete(variants).where(eq(variants.dropId, dropId));
  await db.insert(variants).values(rows.map((r) => ({ dropId, ...r })));
}

export async function seedDemo(): Promise<DropWithVariants[]> {
  const now = Date.now();
  const h100Staging = stagingFor(H100_CLUSTER, now);
  const b200Staging = stagingFor(B200_SUPERCLUSTER, now);

  // ---- NVIDIA H100 SXM5 Cluster: keep existing row if present (preserve UUID + action), else create. ----
  let h100 = (await findDropByName(H100_CLUSTER)) ?? (await findDropByName(MAC_MINI)) ?? null;
  if (!h100) {
    h100 = await createDrop({
      name: H100_CLUSTER,
      status: "coming_soon",
      opensAt: h100Staging.opensAt,
      closesAt: h100Staging.closesAt,
      totalSlots: 1,
      priceUsdc: "0.1",
      variants: [
        { name: "Stealth Chassis", sku: "H100-80GB-STL", stock: 1 },
        { name: "Liquid Silver", sku: "H100-80GB-SLV", stock: 1 },
      ],
    });
  } else {
    await db
      .update(drops)
      .set({
        name: H100_CLUSTER,
        status: "coming_soon",
        opensAt: h100Staging.opensAt,
        closesAt: h100Staging.closesAt,
        drawnAt: null,
        priceUsdc: "0.1",
        totalSlots: 1,
      })
      .where(eq(drops.id, h100.id));
    await replaceVariants(h100.id, [
      { name: "Stealth Chassis", sku: "H100-80GB-STL", stock: 1 },
      { name: "Liquid Silver", sku: "H100-80GB-SLV", stock: 1 },
    ]);
  }

  // ---- NVIDIA Blackwell B200 Supercluster: reuse existing row if present, else create fresh. ----
  let b200 =
    (await findDropByName(B200_SUPERCLUSTER)) ??
    (await findDropByName(RTX_5090)) ??
    (await findDropByName(MAC_STUDIO)) ??
    null;
  if (!b200) {
    b200 = await createDrop({
      name: B200_SUPERCLUSTER,
      status: "coming_soon",
      opensAt: b200Staging.opensAt,
      closesAt: b200Staging.closesAt,
      totalSlots: 1,
      priceUsdc: "0.5",
      variants: [{ name: "NVL72 Supercluster Slot", sku: "B200-192GB-NVL72", stock: 1 }],
    });
  } else {
    await db
      .update(drops)
      .set({
        name: B200_SUPERCLUSTER,
        status: "coming_soon",
        opensAt: b200Staging.opensAt,
        closesAt: b200Staging.closesAt,
        drawnAt: null,
        priceUsdc: "0.5",
        totalSlots: 1,
      })
      .where(eq(drops.id, b200.id));
    await replaceVariants(b200.id, [
      { name: "NVL72 Supercluster Slot", sku: "B200-192GB-NVL72", stock: 1 },
    ]);
  }

  const a = await getDropWithVariants(h100.id);
  const b = await getDropWithVariants(b200.id);
  return [a!, b!];
}
