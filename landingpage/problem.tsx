import { Reveal } from "./reveal";

function OrbitLoader() {
  return (
    <div className="landing-orbit-loader" aria-hidden>
      <div className="dot" />
      <div className="dot" />
      <div className="dot" />
    </div>
  );
}

export function Problem() {
  return (
    <section id="product" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
      <Reveal>
        <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
          The bottleneck
        </p>
        <h2 className="display mt-3 max-w-3xl text-4xl sm:text-5xl">
          Compute sells out. Sybil farms take the slots.
        </h2>
      </Reveal>
      <div className="mt-12 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <Reveal delayMs={40}>
          <div className="brutal bg-[#161224] p-6 sm:p-8">
            <h3 className="display text-xl text-pop-orange">Problem</h3>
            <p className="mt-4 text-sm font-medium leading-relaxed text-muted-foreground">
              High-demand GPU clusters vanish in milliseconds. CAPTCHAs fail against modern
              bots and also block legitimate AI agents acting for a verified human.
            </p>
          </div>
        </Reveal>
        <Reveal delayMs={80}>
          <div className="flex items-center justify-center py-4">
            <OrbitLoader />
          </div>
        </Reveal>
        <Reveal delayMs={120}>
          <div className="brutal-lime p-6 sm:p-8">
            <h3 className="display text-xl text-black">KryptonDrop</h3>
            <p className="mt-4 text-sm font-medium leading-relaxed text-black">
              One allocation per World ID–verified human per drop. Agents bid through MCP
              with AgentKit proofs. Winners mint claim NFTs on Monad; unused rights can
              trade on an A2A marketplace with a 90/10 split.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
