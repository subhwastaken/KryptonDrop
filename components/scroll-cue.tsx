"use client";

// "Scroll for the drop" cue pinned to the bottom of the hero panel. Bouncing chevron +
// label; click smooth-scrolls to the target panel (by data-slug) inside the ScrollDeck.
// Fades out once the deck has been scrolled past the hero.

import { useEffect, useRef, useState } from "react";

export default function ScrollCue({ targetSlug }: { targetSlug?: string }) {
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  // The deck is the scroll container — find it and watch its scrollTop.
  useEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>(".snap-y");
    if (!scroller) return;
    const onScroll = () => setHidden(scroller.scrollTop > 120);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  const go = () => {
    const scroller = ref.current?.closest<HTMLElement>(".snap-y");
    const target = scroller?.querySelector<HTMLElement>(
      `[data-slug="${CSS.escape(targetSlug ?? "")}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={go}
      aria-label="Scroll down to the first drop"
      className={`group absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 transition-opacity duration-300 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <span className="text-xs font-extrabold uppercase tracking-widest">
        Scroll for the drop
      </span>
      <span className="brutal flex h-9 w-9 items-center justify-center bg-lime motion-safe:animate-bounce">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="square"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </button>
  );
}
