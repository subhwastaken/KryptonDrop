// Landing (M11) — a single full-page scroll-snap deck: hero panel → one full-screen listing
// per live drop (Mac Mini, GeForce RTX 5090). Scrolling rewrites the URL per panel; the
// /[slug] route deep-links straight to a panel. The whole selection is visible by scrolling.
import DropDeck from "@/components/drop-deck";

export const dynamic = "force-dynamic";

export default function Home() {
  return <DropDeck initialSlug="" />;
}
