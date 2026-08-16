// Scroll-deck proof (M11). Captures each full-screen panel, verifies the URL rewrites as the
// deck scrolls, and verifies a deep link (/rtx-5090) auto-scrolls to that panel on load.
// Uses full chromium (WebGL for the hero's 3D stage).
import { chromium } from "playwright-core";

const base = process.argv[2] || "http://localhost:3200";
const outDir = process.argv[3] || "/home/carson/eth_global_2026/docs/screenshots";
const executablePath = process.env.CHROME_BIN;

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 880 }, deviceScaleFactor: 2 });
page.on("console", (m) => {
  const t = m.text();
  if (/error|fail|webgl/i.test(t) && !/scheduled an update|lit\.dev/.test(t)) console.log("  [browser]", t);
});

const deckSel = ".snap-y";
const panelSlug = async (i) =>
  page.$eval(`${deckSel} [data-slug]:nth-child(${i + 1})`, (el) => el.dataset.slug);

// ---- 1) Load home, wait for the 3D hero, capture each panel by scrolling the deck ----
console.log("goto", base);
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector(deckSel);
await page
  .waitForFunction(
    () => Array.from(document.querySelectorAll("model-viewer")).every((e) => e.loaded),
    { timeout: 30000 },
  )
  .catch(() => console.log("  ! model load wait timed out"));
await page.waitForTimeout(1200);

const panelCount = await page.$$eval(`${deckSel} [data-slug]`, (els) => els.length);
console.log("panels:", panelCount);

for (let i = 0; i < panelCount; i++) {
  // Scroll this panel to the top of the deck viewport.
  await page.$eval(
    `${deckSel} [data-slug]:nth-child(${i + 1})`,
    (el) => el.scrollIntoView({ behavior: "instant", block: "start" }),
  );
  await page.waitForTimeout(900); // settle snap + URL sync + (for items) image load
  const slug = await panelSlug(i);
  const url = page.url();
  const name = slug ? slug : "hero";
  await page.screenshot({ path: `${outDir}/deck-${i}-${name}.png` });
  console.log(`panel ${i}: data-slug="${slug}" → URL ${url}  (saved deck-${i}-${name}.png)`);
}

// ---- 2) Deep-link: load /rtx-5090 fresh, assert it starts scrolled to that panel ----
console.log("deep-link test: /rtx-5090");
await page.goto(`${base}/rtx-5090`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const deep = await page.evaluate(() => {
  const scroller = document.querySelector(".snap-y");
  const panel = document.querySelector('[data-slug="rtx-5090"]');
  if (!scroller || !panel) return { ok: false };
  const sRect = scroller.getBoundingClientRect();
  const pRect = panel.getBoundingClientRect();
  // panel top aligned to deck top (within a tolerance) = correctly deep-scrolled
  return { ok: Math.abs(pRect.top - sRect.top) < 8, delta: Math.round(pRect.top - sRect.top), url: location.pathname };
});
console.log("deep-link landed on rtx-5090:", JSON.stringify(deep));
await page.screenshot({ path: `${outDir}/deck-deeplink-rtx.png` });

await browser.close();
console.log("done");
