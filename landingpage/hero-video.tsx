"use client";

const SRC = "/videos/SUBJECT_CONCEPT__An_abstract.mp4";

export function HeroVideoBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden landing-hero-video" aria-hidden>
      <video
        className="h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      >
        <source src={SRC} type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-[#0E0C15]/55" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0E0C15]/40 via-transparent to-[#0E0C15]" />
    </div>
  );
}
