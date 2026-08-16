"use client";

// Small client button that smooth-scrolls to a panel (by data-slug) inside the ScrollDeck.
// Used for the hero's "Shop the drop" CTA so it jumps to the first item panel.
import { useRef } from "react";

export default function ScrollToButton({
  targetSlug,
  children,
  className,
}: {
  targetSlug?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const go = () => {
    const scroller = ref.current?.closest<HTMLElement>(".snap-y");
    const target = scroller?.querySelector<HTMLElement>(
      `[data-slug="${CSS.escape(targetSlug ?? "")}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <button ref={ref} type="button" onClick={go} className={className}>
      {children}
    </button>
  );
}
