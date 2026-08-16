import { Reveal } from "./reveal";
import { LandingButton } from "./button";

export function CtaBand() {
  return (
    <section className="px-5 pb-20 sm:px-8">
      <Reveal>
        <div className="brutal-lime mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center sm:p-12">
          <div>
            <h2 className="display text-3xl text-black sm:text-4xl">Ready to allocate a slot?</h2>
            <p className="mt-3 max-w-md text-sm font-medium text-black/80">
              Open the Command Center for the live drop, or walk the 3D showroom as a verified
              human.
            </p>
          </div>
          <LandingButton href="/home">ENTER COMMAND CENTER</LandingButton>
        </div>
      </Reveal>
    </section>
  );
}
