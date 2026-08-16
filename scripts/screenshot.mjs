// Quick screenshot helper (M9 design proof). Captures the landing + a drop page from a
// running server. Usage: node screenshot.mjs <baseUrl> <outDir>
import { chromium } from "playwright-core";

const base = process.argv[2] || "http://localhost:3100";
const outDir = process.argv[3] || "/tmp";
const executablePath =
  process.env.CHROME_BIN ||
  "/home/carson/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

// Landing
await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/m9-landing.png`, fullPage: true });
console.log(`saved ${outDir}/m9-landing.png`);

// First drop's detail page (the live Mac Mini)
const href = await page.getAttribute('a[href^="/drops/"]', "href");
if (href) {
  await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/m9-drop.png`, fullPage: true });
  console.log(`saved ${outDir}/m9-drop.png (${href})`);
}

await browser.close();
