"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LandingButton } from "./button";
import { LandingWorldId } from "./world-id";

const LINKS = [
  { href: "#product", id: "product", label: "Product" },
  { href: "#how", id: "how", label: "How it works" },
  { href: "#surfaces", id: "surfaces", label: "Surfaces" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <header className={`landing-nav ${scrolled ? "is-scrolled" : ""}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="display text-lg text-white sm:text-xl">
          KRYPTON·DROP
        </Link>
        <nav className="hidden items-center gap-2 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`landing-nav__link ${active === l.id ? "is-active" : ""}`}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <LandingWorldId />
          <LandingButton href="/home" size="sm">
            ENTER APP
          </LandingButton>
        </div>
      </div>
    </header>
  );
}
