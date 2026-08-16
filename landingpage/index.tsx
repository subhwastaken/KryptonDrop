import "./landing.css";
import { LandingNav } from "./nav";
import { LandingHero } from "./hero";
import { HeroVideoBackground } from "./hero-video";
import { ProofBar } from "./proof-bar";
import { Problem } from "./problem";
import { HowItWorks } from "./how-it-works";
import { Bento } from "./bento";
import { CtaBand } from "./cta-band";
import { LandingSpeeder } from "./speeder";

export function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="relative isolate min-h-svh">
        <HeroVideoBackground />
        <div className="relative z-10 flex min-h-svh flex-col">
          <LandingNav />
          <LandingHero />
        </div>
      </div>
      <main>
        <ProofBar />
        <Problem />
        <HowItWorks />
        <LandingSpeeder />
        <Bento />
        <CtaBand />
      </main>
    </div>
  );
}
