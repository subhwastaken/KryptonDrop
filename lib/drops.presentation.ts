// Presentation metadata for the drop panels (M11). This is *display* data — slugs, product
// photos, accent colors, spec copy — that doesn't belong in the DB. Keyed by drop name so it
// maps onto whatever the seed created. The scroll deck + item panels read from here.

export type DropPresentation = {
  slug: string; // deep-link URL segment, e.g. "mac-mini" → /mac-mini
  accent: string; // tailwind bg-* class for the panel accent
  tagline: string; // short line above the title
  // Product photos. If `byVariant` is set, the panel swaps the photo to match the selected
  // finish (keyed by variant NAME); `default` is the fallback / single photo.
  photo: {
    default: string;
    byVariant?: Record<string, string>;
  };
  specs: string[]; // bullet list (store3-style)
};

// name (exact DB drop name) → presentation
const BY_NAME: Record<string, DropPresentation> = {
  "NVIDIA H100 SXM5 Cluster": {
    slug: "h100-cluster",
    accent: "bg-lime",
    tagline: "Enterprise AI · Per-Second Compute Node",
    photo: {
      default: "/products/mac-mini-black.webp",
      byVariant: {
        "Stealth Chassis": "/products/mac-mini-black.webp",
        "Liquid Silver": "/products/mac-mini-silver.webp",
      },
    },
    specs: [
      "8x NVIDIA H100 SXM5 · 80GB HBM3 memory per GPU",
      "3.35 TB/s HBM3 high-bandwidth interconnect",
      "32 PFLOPS FP8 Transformer Engine compute capacity",
      "Trustless per-second SLA & execution metering on Monad",
      "1 verified human or AI agent per rental allocation slot",
    ],
  },
  "NVIDIA Blackwell B200 Supercluster": {
    slug: "blackwell-b200",
    accent: "bg-pop-blue",
    tagline: "Exascale AI · High-Density Inference Node",
    photo: {
      default: "/products/rtx-5090.webp",
    },
    specs: [
      "NVIDIA Blackwell B200 GPU · 192GB HBM3e unified pool",
      "8 TB/s ultra-low latency memory bandwidth",
      "20 PFLOPS FP4 AI inference & fine-tuning throughput",
      "Bot-proof Sybil reservation via World ID & AgentKit",
      "Instant secondary DEX liquidity & A2A yield split",
    ],
  },
  // Legacy aliases to preserve compatibility with existing DB rows
  "Mac Mini": {
    slug: "h100-cluster",
    accent: "bg-lime",
    tagline: "Enterprise AI · Per-Second Compute Node",
    photo: {
      default: "/products/mac-mini-black.webp",
      byVariant: {
        "Stealth Chassis": "/products/mac-mini-black.webp",
        "Liquid Silver": "/products/mac-mini-silver.webp",
      },
    },
    specs: [
      "8x NVIDIA H100 SXM5 · 80GB HBM3 memory per GPU",
      "3.35 TB/s HBM3 high-bandwidth interconnect",
      "32 PFLOPS FP8 Transformer Engine compute capacity",
      "Trustless per-second SLA & execution metering on Monad",
      "1 verified human or AI agent per rental allocation slot",
    ],
  },
  "GeForce RTX 5090": {
    slug: "blackwell-b200",
    accent: "bg-pop-blue",
    tagline: "Exascale AI · High-Density Inference Node",
    photo: {
      default: "/products/rtx-5090.webp",
    },
    specs: [
      "NVIDIA Blackwell B200 GPU · 192GB HBM3e unified pool",
      "8 TB/s ultra-low latency memory bandwidth",
      "20 PFLOPS FP4 AI inference & fine-tuning throughput",
      "Bot-proof Sybil reservation via World ID & AgentKit",
      "Instant secondary DEX liquidity & A2A yield split",
    ],
  },
};

// Slugs in display order (drives the scroll deck order after the hero).
export const DROP_SLUG_ORDER = ["h100-cluster", "blackwell-b200"] as const;

export function presentationFor(dropName: string): DropPresentation | undefined {
  return BY_NAME[dropName];
}

export function slugForDrop(dropName: string): string | undefined {
  return BY_NAME[dropName]?.slug;
}

// All recognized panel slugs, including the hero, in scroll order.
export const HERO_SLUG = "";
export function allPanelSlugs(): string[] {
  return [HERO_SLUG, ...DROP_SLUG_ORDER];
}
