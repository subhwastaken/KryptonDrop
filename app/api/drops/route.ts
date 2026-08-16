// Public drops listing (M3): open + coming-soon drops with their variants.
import { listDrops } from "@/lib/drops.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const drops = await listDrops();
  return Response.json({ drops });
}
