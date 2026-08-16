// Winner-page screenshot (M12). Captures /win/<entryId> in a `won` state →
// docs/screenshots/m12-winner.png. Uses NIX-provided Chromium (PRD M12 step 4 — replaces the
// M9 apt-.deb + LD_LIBRARY_PATH hack): resolve the browser with
//   nix build nixpkgs#chromium --no-link --print-out-paths   → ${out}/bin/chromium
// and pass it as executablePath. Honors a CHROMIUM_BIN / CHROME_BIN override.
//
// Usage: node scripts/shot-winner.mjs <baseUrl> <entryId> [outDir]
import { chromium } from "playwright-core";

const base = process.argv[2] || "http://localhost:3200";
const entryId = process.argv[3];
const outDir = process.argv[4] || "/home/carson/eth_global_2026/docs/screenshots";
if (!entryId) {
  console.error("usage: node scripts/shot-winner.mjs <baseUrl> <entryId> [outDir]");
  process.exit(2);
}

const executablePath = process.env.CHROMIUM_BIN || process.env.CHROME_BIN;
if (!executablePath) {
  console.error("set CHROMIUM_BIN (or CHROME_BIN) to the nix chromium binary");
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1366, height: 900 },
  deviceScaleFactor: 2,
});
page.on("console", (m) => {
  const t = m.text();
  if (/error|fail/i.test(t)) console.log("  [browser]", t);
});

const url = `${base}/win/${entryId}`;
console.log("goto", url);
await page.goto(url, { waitUntil: "networkidle" });
// Wait for the product image + the "YOU WON" headline to render.
await page.waitForSelector("text=YOU WON", { timeout: 15000 }).catch(() => {
  console.log("  ! 'YOU WON' headline not found — capturing whatever rendered");
});
await page.waitForTimeout(1000);

const out = `${outDir}/m12-winner.png`;
await page.screenshot({ path: out });
console.log("saved", out);

await browser.close();
console.log("done");
