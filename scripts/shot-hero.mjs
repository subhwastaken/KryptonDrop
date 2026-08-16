// Hero 3D screenshot proof. Launches FULL chromium (WebGL via SwiftShader) against the
// running dev server, waits for both <model-viewer> GLBs to finish loading, then captures
// the full-height hero + the model stage at several points across the 8s spin/swap cycle.
//
// Usage: node scripts/shot-hero.mjs <baseUrl> <outDir>
import { chromium } from "playwright-core";

const base = process.argv[2] || "http://localhost:3200";
const outDir = process.argv[3] || "/home/carson/eth_global_2026/docs/screenshots";
const executablePath =
  process.env.CHROME_BIN ||
  "/home/carson/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";

const browser = await chromium.launch({
  executablePath,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--no-sandbox",
  ],
});

const page = await browser.newPage({
  viewport: { width: 1366, height: 900 },
  deviceScaleFactor: 2,
});

page.on("console", (m) => {
  const t = m.text();
  if (/error|warn|webgl|model-viewer/i.test(t)) console.log("  [browser]", t);
});

console.log("goto", base);
await page.goto(base, { waitUntil: "networkidle" });

// Wait for the custom element to be defined + both GLBs to fire `load`.
await page.waitForFunction(
  () => {
    const els = Array.from(document.querySelectorAll("model-viewer"));
    if (els.length < 2) return false;
    // `loaded` is a model-viewer property that flips true once the GLB is ready.
    return els.every((e) => e.loaded === true || e.modelIsVisible === true);
  },
  { timeout: 30000 }
).catch(() => console.log("  ! timed out waiting for model load (capturing anyway)"));

// Give the first model a beat to start spinning.
await page.waitForTimeout(1000);

// Full hero (first viewport only — that's the 100svh hero).
await page.screenshot({ path: `${outDir}/hero-full.png` });
console.log("saved hero-full.png");

// Clip the right-hand model stage.
const clipRight = { x: 730, y: 120, width: 620, height: 640 };

// Dense, phase-independent sweep: capture every 1.6s for ~19s so the full
// Mac->shrink->Nvidia->shrink->Mac cycle is visible regardless of where it starts.
const STEP = 1600;
const N = 12;
for (let i = 0; i < N; i++) {
  await page.screenshot({
    path: `${outDir}/cycle-${String(i).padStart(2, "0")}.png`,
    clip: clipRight,
  });
  // Note which model model-viewer currently shows + its scale, for the log.
  const state = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("model-viewer"));
    return els.map((e) => ({
      src: (e.getAttribute("src") || "").split("/").pop(),
      vis: e.modelIsVisible,
      scale: getComputedStyle(e).transform,
    }));
  });
  const shown = state.find((s) => !/matrix\(0/.test(s.scale));
  console.log(`cycle-${i} (${i * STEP}ms): showing ${shown ? shown.src : "?"}`);
  if (i < N - 1) await page.waitForTimeout(STEP);
}

// Scroll-cue proof (bottom strip of the hero).
await page.evaluate(() => window.scrollTo({ top: 0 }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/hero-cue.png`, clip: { x: 0, y: 600, width: 1366, height: 300 } });
console.log("saved hero-cue.png");

await browser.close();
console.log("done");
