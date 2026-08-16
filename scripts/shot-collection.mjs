// Quick proof that the collection (listings) section renders below the full-height hero
// and is reachable by scrolling. Captures the page scrolled to #collection.
import { chromium } from "playwright-core";

const base = process.argv[2] || "http://localhost:3200";
const outDir = process.argv[3] || "/home/carson/eth_global_2026/docs/screenshots";
const executablePath = process.env.CHROME_BIN;

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 });
await page.goto(base, { waitUntil: "networkidle" });

// Click the scroll cue, then snap to the collection anchor.
await page.evaluate(() => document.getElementById("collection")?.scrollIntoView({ behavior: "instant" }));
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/collection.png` });
console.log("saved collection.png");

// Also a full-page tall shot for the record.
await page.evaluate(() => window.scrollTo({ top: 0 }));
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/landing-fullpage.png`, fullPage: true });
console.log("saved landing-fullpage.png");

await browser.close();
console.log("done");
