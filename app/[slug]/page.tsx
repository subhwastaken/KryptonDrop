// Deep-link route (M11): /mac-mini, /rtx-5090 — renders the SAME scroll deck as `/` but tells
// it to scroll straight to that panel on load. Named routes (admin, drops, api) take precedence
// over this catch-all, and unknown slugs 404.
import { notFound } from "next/navigation";
import DropDeck from "@/components/drop-deck";
import { DROP_SLUG_ORDER } from "@/lib/drops.presentation";

export const dynamic = "force-dynamic";

const VALID = new Set<string>(DROP_SLUG_ORDER);

export default async function PanelDeepLink({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!VALID.has(slug)) notFound();
  return <DropDeck initialSlug={slug} />;
}
