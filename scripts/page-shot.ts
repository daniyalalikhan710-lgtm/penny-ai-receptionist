/**
 * Screenshot any page of the running app.
 *   pnpm tsx scripts/page-shot.ts <url> <out.png> [width] [height] [--full]
 */
import { chromium } from "@playwright/test";

const [url, out, width = "1440", height = "900"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const full = process.argv.includes("--full");

async function main(): Promise<void> {
  if (!url || !out) throw new Error("usage: page-shot.ts <url> <out.png> [width] [height] [--full]");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
  page.on("console", (message) => {
    if (message.type() === "error") console.error("[browser error] " + message.text());
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: out, fullPage: full });
  await browser.close();
  console.log("saved " + out);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
