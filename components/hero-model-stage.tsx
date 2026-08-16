"use client";

// Spinning 3D product hero (M11 visual pass).
// Cycles Mac Mini <-> Nvidia RTX 5090: each spins ~8s, shrinks to nothing, then the
// other expands and spins. Both <model-viewer> elements stay mounted (so WebGL/GLB
// never re-initialise mid-show) — we just scale+fade the inactive one to 0. The
// continuous spin is model-viewer's built-in `auto-rotate`.
//
// model-viewer touches custom-element + WebGL APIs, so this is client-only and the
// page loads it via next/dynamic({ ssr: false }).

import { useEffect, useState } from "react";
// Side-effect import: registers the <model-viewer> custom element in the browser.
import "@google/model-viewer";

// The GLBs are Draco-compressed (21MB → ~1.3MB). model-viewer defaults to fetching the
// Draco decoder from a Google CDN; we self-host it under /public/draco so the page (and
// the demo) never depends on an external CDN at runtime. Set before any model loads.
function useLocalDracoDecoder() {
  useEffect(() => {
    const MV = customElements.get("model-viewer") as
      | (CustomElementConstructor & { dracoDecoderLocation?: string })
      | undefined;
    if (MV && !MV.dracoDecoderLocation?.includes("/draco/")) {
      MV.dracoDecoderLocation = `${window.location.origin}/draco/`;
    }
  }, []);
}

type ModelDef = {
  src: string;
  alt: string;
  label: string;
  // Per-model framing knobs (the two GLBs have very different proportions).
  orbit: string; // initial camera-orbit: theta phi radius — a flattering 3/4 view
  scale: number; // CSS scale multiplier for the stage box
  exposure: number; // brighter = shinier/punchier highlights on the clearcoat
};

const MODELS: ModelDef[] = [
  {
    src: "/models/mac-mini.glb",
    alt: "NVIDIA H100 SXM5 Cluster node, rotating",
    label: "H100 SXM5 Cluster",
    // 3/4 angle from slightly above — flat slab now sits Y-up, so this shows the
    // top face + two sides, never the underside vent.
    orbit: "-30deg 62deg 105%",
    scale: 1.18,
    // Pushed up so the aluminium clearcoat catches sharper, glossier highlights.
    exposure: 1.32,
  },
  {
    src: "/models/nvidia-5090.glb",
    alt: "NVIDIA Blackwell B200 Supercluster rig, rotating",
    label: "Blackwell B200",
    orbit: "-22deg 76deg 92%",
    scale: 1.2,
    exposure: 1.08,
  },
];

// 8s of full-size spinning per model; the scale/fade transition (CSS, 700ms) overlaps
// the handoff so one shrinks to nothing as the next grows.
const HOLD_MS = 8000;

export default function HeroModelStage() {
  const [active, setActive] = useState(0);
  useLocalDracoDecoder();

  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => (i + 1) % MODELS.length);
    }, HOLD_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-full w-full select-none" aria-hidden="false">
      {MODELS.map((m, i) => {
        const isActive = i === active;
        return (
          // @ts-expect-error — model-viewer is a custom element, not in JSX types.
          <model-viewer
            key={m.src}
            src={m.src}
            alt={m.alt}
            // Constant spin (model-viewer pauses the off-screen, scaled-to-0 one on its
            // own via visibility), so we never toggle props mid-cycle → no re-render churn.
            auto-rotate
            auto-rotate-delay="0"
            rotation-per-second="40deg"
            camera-orbit={m.orbit}
            interaction-prompt="none"
            disable-zoom
            disable-pan
            shadow-intensity="1"
            shadow-softness="0.8"
            exposure={m.exposure}
            tone-mapping="neutral"
            environment-image="neutral"
            loading="eager"
            reveal="auto"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "transparent",
              // Shrink-to-nothing handoff: inactive collapses to scale 0.
              transform: `scale(${isActive ? m.scale : 0})`,
              opacity: isActive ? 1 : 0,
              transition:
                "transform 700ms cubic-bezier(0.34, 1.4, 0.5, 1), opacity 480ms ease",
              pointerEvents: "none",
              ["--poster-color" as string]: "transparent",
            }}
          />
        );
      })}

      {/* Caption sticker — which device is on stage. */}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2">
        <span className="pill bg-lime whitespace-nowrap text-[0.7rem]">
          {MODELS[active].label} · live drop
        </span>
      </div>
    </div>
  );
}
