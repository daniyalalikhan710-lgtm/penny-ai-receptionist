/**
 * Captures the README screenshots (and doubles as a visual smoke test).
 *
 *   pnpm dev            # in another terminal
 *   pnpm screenshots    # writes docs/screenshots/*.png
 *
 * Options: --url http://localhost:3000  --out docs/screenshots  --only golden,mobile
 * The browser clock is pinned to 10:30 AM today so the dispatch board always
 * shows the same mid-morning state.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg("url", "http://localhost:3000");
const OUT = path.resolve(arg("out", "docs/screenshots"));
const ONLY = arg("only", "").split(",").filter(Boolean);

function tenThirtyToday(): Date {
  const d = new Date();
  d.setHours(10, 30, 0, 0);
  return d;
}

async function open(browser: Browser, viewport: { width: number; height: number }, options: { reducedMotion?: boolean; mobile?: boolean } = {}): Promise<Page> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
    isMobile: options.mobile ?? false,
    hasTouch: options.mobile ?? false,
  });
  const page = await context.newPage();
  await page.clock.install({ time: tenThirtyToday() });
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`[browser error] ${message.text()}`);
  });
  page.on("pageerror", (error) => console.error(`[page error] ${error.message}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByTestId("chat-widget").or(page.getByTestId("dashboard")).first().waitFor();
  return page;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  saved ${name}.png`);
}

/** Waits until Penny has finished replying. */
async function settled(page: Page): Promise<void> {
  await page.locator('[data-testid="chat-widget"][data-busy="false"]').waitFor({ timeout: 45_000 });
}

async function say(page: Page, text: string): Promise<void> {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("send-button").click();
}

async function golden(browser: Browser): Promise<void> {
  console.log("golden path");
  const page = await open(browser, { width: 1440, height: 900 });
  await shot(page, "01-start");
  await page.getByRole("button", { name: /My water heater is leaking/ }).click();
  await page.getByTestId("card-slots").waitFor({ timeout: 45_000 });
  await settled(page);
  await page.getByTestId("card-diagnosis").scrollIntoViewIfNeeded();
  await shot(page, "02-diagnosis");
  await page.getByTestId("card-slots").scrollIntoViewIfNeeded();
  await shot(page, "03-slots");
  await page.getByTestId("slot-option").first().click();
  await page.getByTestId("card-details").waitFor({ timeout: 30_000 });
  await settled(page);
  await shot(page, "04-details");
  await page.getByTestId("details-submit").click();
  await page.getByTestId("card-checkout").waitFor({ timeout: 30_000 });
  await settled(page);
  await shot(page, "05-checkout");
  await page.getByTestId("pay-button").click();
  await page.waitForTimeout(1500);
  await shot(page, "06-flight");
  await page.getByTestId("card-confirmation").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.waitForTimeout(1200);
  await shot(page, "07-confirmed");
  await page.getByTestId("xray-toggle").click();
  await page.waitForTimeout(400);
  await shot(page, "08-xray");
  await page.context().close();
}

async function emergency(browser: Browser): Promise<void> {
  console.log("emergency");
  const page = await open(browser, { width: 1440, height: 900 });
  await page.getByRole("button", { name: "I smell gas in my kitchen" }).click();
  await page.getByTestId("card-emergency").waitFor({ timeout: 30_000 });
  await settled(page);
  await shot(page, "10-emergency");
  await page.getByTestId("callback-open").click();
  await page.getByTestId("callback-submit").click();
  await page.getByTestId("card-handoff").waitFor({ timeout: 30_000 });
  await settled(page);
  await shot(page, "11-emergency-callback");
  await page.context().close();
}

async function citations(browser: Browser): Promise<void> {
  console.log("citations");
  const page = await open(browser, { width: 1440, height: 900 });
  await page.getByRole("button", { name: "What's your warranty on repairs?" }).click();
  await page.getByTestId("citation-chip").first().waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByTestId("citation-chip").first().click();
  await page.getByTestId("citation-highlight").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await shot(page, "12-citation-drawer");
  await page.context().close();
}

async function spanish(browser: Browser): Promise<void> {
  console.log("spanish");
  const page = await open(browser, { width: 1440, height: 900 });
  await page.getByRole("button", { name: /Pueden arreglar/ }).click();
  await page.getByTestId("card-slots").waitFor({ timeout: 30_000 });
  await settled(page);
  await shot(page, "13-spanish");
  await page.context().close();
}

async function reschedule(browser: Browser): Promise<void> {
  console.log("reschedule");
  const page = await open(browser, { width: 1440, height: 900 });
  await page.getByRole("button", { name: /Reschedule my appointment/ }).click();
  await page.getByTestId("card-slots").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByTestId("slot-option").nth(1).click();
  await page.getByTestId("card-confirmation").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.waitForTimeout(800);
  await shot(page, "14-reschedule");
  await page.context().close();
}

async function takeover(browser: Browser): Promise<void> {
  console.log("takeover");
  const page = await open(browser, { width: 1440, height: 900 });
  await say(page, "Do you service 97406?");
  await page.getByTestId("card-service-area").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByTestId("lead-lead-live").click();
  await page.getByTestId("take-over").click();
  await page.getByTestId("staff-input").fill("Hi, Sam here from Copperline. Yes, we're in Millbrook every day. I can fit you in first thing tomorrow.");
  await page.getByTestId("staff-send").click();
  await page.waitForTimeout(500);
  await shot(page, "15-takeover");
  await page.getByTestId("hand-back").click();
  await page.waitForTimeout(600);
  await settled(page);
  await page.waitForTimeout(600);
  await shot(page, "16-handback");
  await page.context().close();
}

async function mobile(browser: Browser): Promise<void> {
  console.log("mobile");
  const page = await open(browser, { width: 375, height: 812 }, { mobile: true });
  await shot(page, "20-mobile-start");
  await page.getByRole("button", { name: /My water heater is leaking/ }).click();
  await page.getByTestId("card-slots").waitFor({ timeout: 45_000 });
  await settled(page);
  await page.getByTestId("card-diagnosis").scrollIntoViewIfNeeded();
  await shot(page, "21-mobile-diagnosis");
  await page.getByTestId("card-slots").scrollIntoViewIfNeeded();
  await shot(page, "22-mobile-slots");
  await page.getByTestId("view-owner").click();
  await page.waitForTimeout(500);
  await shot(page, "23-mobile-owner");
  await page.context().close();
}

async function owner(browser: Browser): Promise<void> {
  console.log("owner");
  const page = await open(browser, { width: 1440, height: 900 });
  await page.getByTestId("view-owner").click();
  await page.waitForTimeout(500);
  await shot(page, "30-owner");
  await page.getByTestId("view-customer").click();
  await page.waitForTimeout(500);
  await shot(page, "31-customer");
  await page.context().close();
}

const FLOWS: Record<string, (browser: Browser) => Promise<void>> = { golden, emergency, citations, spanish, reschedule, takeover, mobile, owner };

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [name, flow] of Object.entries(FLOWS)) {
      if (ONLY.length > 0 && !ONLY.includes(name)) continue;
      await flow(browser);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
