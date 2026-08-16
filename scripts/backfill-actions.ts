// One-off: backfill drops.world_action_id with the deterministic v4 action string
// (`drop_<uuid>`) for the two seeded demo drops. The World ID v4 actions were
// created in the Developer Portal (M4) via the world-developer-portal MCP.
import "dotenv/config";
import { db } from "@/lib/db";
import { drops } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const ids = [
    "c27f512e-af27-4963-88d3-a54bdab108a6", // Mac Mini
    "aafd0d75-d313-4aec-8b26-e558a6ffd9ba", // Mac Studio
  ];
  for (const id of ids) {
    const action = `drop_${id}`;
    await db.update(drops).set({ worldActionId: action }).where(eq(drops.id, id));
    const [row] = await db.select().from(drops).where(eq(drops.id, id));
    console.log(row.name, "->", row.worldActionId);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
