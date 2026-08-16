import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { entries, drops } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAllClaimListings, isClaimListed } from "@/lib/a2a.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  let myVouchers: any[] = [];

  if (session) {
    // Find all of the user's purchased vouchers
    const userEntries = await db
      .select({
        id: entries.id,
        status: entries.status,
        createdAt: entries.createdAt,
        dropId: entries.dropId,
        dropName: drops.name,
        priceUsdc: drops.priceUsdc,
      })
      .from(entries)
      .innerJoin(drops, eq(entries.dropId, drops.id))
      .where(
        and(
          eq(entries.humanKey, session.humanKey),
          eq(entries.status, "purchased")
        )
      );

    // Filter out already listed vouchers
    myVouchers = [];
    for (const e of userEntries) {
      if (!(await isClaimListed(e.id))) myVouchers.push(e);
    }
  }

  const listings = await getAllClaimListings();

  return Response.json({
    listings,
    myVouchers,
    signedIn: !!session,
    humanKey: session?.humanKey || null,
  });
}
