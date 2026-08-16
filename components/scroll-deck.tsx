"use client";

// Full-page vertical scroll-snap deck (M11). Each child panel is a 100svh snap section.
// As the user scrolls, the URL is rewritten to the active panel's slug via history
// .replaceState (no reload, no scroll jump). On load, the deck scrolls to `initialSlug`
// so deep links like /rtx-5090 land on the right panel.
//
// The deck itself is the scroll viewport (not window) — more reliable for snap + the
// IntersectionObserver that tracks the active panel.

import { useEffect, useRef } from "react";

export type DeckPanel = {
  slug: string; // "" for the hero, "mac-mini", "rtx-5090", …
  node: React.ReactNode;
};

export default function ScrollDeck({
  panels,
  initialSlug,
}: {
  panels: DeckPanel[];
  initialSlug: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Avoid clobbering the URL while we programmatically scroll on first load.
  const settling = useRef(true);

  // ---- Initial deep-link scroll ----
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-slug="${CSS.escape(initialSlug)}"]`,
    );
    if (target) {
      // Jump (not smooth) so a deep-link load doesn't animate through every panel.
      target.scrollIntoView({ behavior: "auto", block: "start" });
    }
    // Release the URL lock once the jump has settled.
    const t = setTimeout(() => {
      settling.current = false;
    }, 250);
    return () => clearTimeout(t);
  }, [initialSlug]);

  // ---- Active-panel → URL sync ----
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sections = Array.from(
      root.querySelectorAll<HTMLElement>("[data-slug]"),
    );

    const setUrl = (slug: string) => {
      const path = slug ? `/${slug}` : "/";
      if (window.location.pathname !== path) {
        window.history.replaceState(null, "", path);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (settling.current) return;
        // Pick the most-visible panel currently intersecting.
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setUrl((best.target as HTMLElement).dataset.slug ?? "");
      },
      { root, threshold: [0.5, 0.6, 0.75] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // ---- React to back/forward (popstate) by scrolling to that slug ----
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onPop = () => {
      const slug = window.location.pathname.replace(/^\//, "");
      const target = root.querySelector<HTMLElement>(
        `[data-slug="${CSS.escape(slug)}"]`,
      );
      if (target) {
        settling.current = true;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => (settling.current = false), 600);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <div
      ref={rootRef}
      className="h-[100svh] snap-y snap-mandatory overflow-y-scroll overscroll-y-contain scroll-smooth"
    >
      {panels.map((p) => (
        <section
          key={p.slug || "hero"}
          data-slug={p.slug}
          className="snap-start"
        >
          {p.node}
        </section>
      ))}
    </div>
  );
}
