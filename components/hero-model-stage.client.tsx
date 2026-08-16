"use client";

// Client boundary for the 3D hero. model-viewer needs the browser (WebGL + custom
// elements), so we load HeroModelStage with ssr:false. Per the bundled Next docs,
// `ssr:false` for next/dynamic must live inside a Client Component.

import dynamic from "next/dynamic";

const HeroModelStage = dynamic(() => import("./hero-model-stage"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="display animate-pulse text-sm text-muted-foreground">
        Loading 3D…
      </span>
    </div>
  ),
});

export default function HeroModelStageClient() {
  return <HeroModelStage />;
}
