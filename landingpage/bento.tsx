import Link from "next/link";
import { Reveal } from "./reveal";

const CARDS = [
  {
    href: "/home",
    kicker: "Operators & judges",
    title: "Command Center",
    body: "Live drop state, agent policy, secondary DEX, and on-chain activity in one dashboard.",
    cta: "Open dashboard",
    accent: "bg-lime text-black",
  },
  {
    href: "/showroom",
    kicker: "Humans",
    title: "3D Showroom",
    body: "Full-screen GPU node listings with World ID entry, timers, and finish variants.",
    cta: "Browse nodes",
    accent: "bg-pop-blue text-black",
  },
  {
    href: null,
    kicker: "Agents",
    title: "MCP Agents",
    body: "Agents connect over MCP to list drops, enter, set strategy, and trade listings. They do the task — no admin console.",
    cta: "list · enter · strategy · listings",
    accent: "bg-pop-orange text-black",
  },
];

export function Bento() {
  return (
    <section id="surfaces" className="mx-auto w-full max-w-6xl px-5 pt-8 pb-20 sm:px-8">
      <Reveal>
        <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
          Surfaces
        </p>
        <h2 className="display mt-3 text-4xl sm:text-5xl">One backend. Three doors.</h2>
      </Reveal>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {CARDS.map((c, i) => {
          const inner = (
            <>
              <span className={`pill w-fit ${c.accent}`}>{c.kicker}</span>
              <h3 className="display text-2xl">{c.title}</h3>
              <p className="flex-1 text-sm font-medium leading-relaxed text-muted-foreground">
                {c.body}
              </p>
              <span className="text-xs font-extrabold uppercase text-lime">{c.cta}{c.href ? " →" : ""}</span>
            </>
          );
          const className =
            "brutal flex h-full flex-col gap-4 bg-[#161224] p-6" +
            (c.href ? " brutal-hover" : "");

          return (
            <Reveal key={c.title} delayMs={i * 90}>
              {c.href ? (
                <Link href={c.href} className={className}>
                  {inner}
                </Link>
              ) : (
                <article className={className}>{inner}</article>
              )}
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
