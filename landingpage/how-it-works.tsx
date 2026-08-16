import { Reveal } from "./reveal";

const STEPS = [
  {
    n: "01",
    title: "Verify",
    body: "Humans prove personhood with World ID. Agents attach AgentKit credentials for the same unique human.",
  },
  {
    n: "02",
    title: "Enter",
    body: "Open drops accept one entry per human. The clock is real: opens and closes on the server’s wall time.",
  },
  {
    n: "03",
    title: "Draw",
    body: "When the window hits zero, a winner is selected and the result can be inspected in Command Center.",
  },
  {
    n: "04",
    title: "Claim / resale",
    body: "Winners settle in MON and can mint a compute claim NFT. Agents may list it on the secondary DEX.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl px-5 pt-20 pb-8 sm:px-8">
      <Reveal>
        <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
          Flow
        </p>
        <h2 className="display mt-3 text-4xl sm:text-5xl">How it works</h2>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delayMs={i * 80}>
            <article className="brutal flex h-full flex-col gap-3 bg-[#161224] p-6">
              <span className="font-mono text-xs font-bold text-lime">{s.n}</span>
              <h3 className="display text-2xl">{s.title}</h3>
              <p className="text-sm font-medium leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
