import HeroModelStageClient from "@/components/hero-model-stage.client";
import { Reveal } from "./reveal";
import { LandingButton } from "./button";

export function LandingHero() {
  return (
    <section className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pb-12 pt-24 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
      <Reveal>
        <div className="flex flex-col gap-8">
          <h1 className="display text-[12vw] leading-[0.95] sm:text-6xl lg:text-7xl">
            Trustless
            <br />
            per-second
            <br />
            <span className="mt-1 inline-block bg-lime px-2 text-black">GPU rentals</span>
          </h1>
          <p className="max-w-lg text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
            One human, one GPU slot, settled in under a second on Monad. World ID stops the
            bots. Agents trade the rest through MCP.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <LandingButton href="/home">ENTER COMMAND CENTER</LandingButton>
            <LandingButton href="/showroom">3D SHOWROOM</LandingButton>
          </div>
        </div>
      </Reveal>
      <Reveal delayMs={120} className="relative h-[38vh] min-h-[260px] w-full lg:h-[62vh]">
        <HeroModelStageClient />
      </Reveal>
    </section>
  );
}
