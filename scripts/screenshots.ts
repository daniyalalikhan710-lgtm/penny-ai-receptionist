/**
 * Captures the README screenshots, the case-study images and the walkthrough
 * video. It drives the real app, so it doubles as a visual smoke test.
 *
 *   pnpm build && pnpm start      # in another terminal (or `pnpm dev`)
 *   pnpm screenshots              # writes docs/screenshots, public/screens, docs/demo.webm
 *
 * Options:
 *   --url http://localhost:3000   where the app is running
 *   --out docs/screenshots        where PNGs go
 *   --only golden,mobile          run a subset of flows
 *   --no-video                    skip docs/demo.webm
 *
 * The browser clock is pinned to 10:30 AM today so the dispatch board always
 * shows the same mid-morning state.
 */
import { mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg("url", "http://localhost:3000");
const OUT = path.resolve(arg("out", "docs/screenshots"));
const WEB = path.resolve(arg("web", "public/screens"));
const ONLY = arg("only", "").split(",").filter(Boolean);
const VIDEO = !args.includes("--no-video");

function tenThirtyToday(): Date {
  const d = new Date();
  d.setHours(10, 30, 0, 0);
  return d;
}

interface OpenOptions {
  mobile?: boolean;
  video?: string;
}

async function open(browser: Browser, viewport: { width: number; height: number }, options: OpenOptions = {}): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: options.mobile ?? false,
    hasTouch: options.mobile ?? false,
    ...(options.video ? { recordVideo: { dir: options.video, size: viewport } } : {}),
  });
  const page = await context.newPage();
  await page.clock.install({ time: tenThirtyToday() });
  page.on("console", (message) => {
    if (message.type() === "error") console.error("[browser error] " + message.text());
  });
  page.on("pageerror", (error) => console.error("[page error] " + error.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByTestId("chat-widget").or(page.getByTestId("dashboard")).first().waitFor();
  return { page, context };
}

/** PNG for the README (CSS pixels, so files stay small) and optionally a JPEG for the site. */
async function shot(page: Page, name: string, web?: string): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, name + ".png"), scale: "css" });
  if (web) await page.screenshot({ path: path.join(WEB, web + ".jpg"), type: "jpeg", quality: 84, scale: "css" });
  console.log("  saved " + name + ".png" + (web ? " (+ " + web + ".jpg)" : ""));
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
  const { page, context } = await open(browser, { width: 1440, height: 900 });
  await shot(page, "01-start");
  await page.getByRole("button", { name: /My water heater is leaking/ }).click();
  await page.getByTestId("card-slots").waitFor({ timeout: 45_000 });
  await settled(page);
  await page.getByTestId("card-diagnosis").scrollIntoViewIfNeeded();
  await shot(page, "02-diagnosis", "diagnosis");
  await page.getByTestId("card-slots").scrollIntoViewIfNeeded();
  await page.getByTestId("slot-option").first().click();
  await page.getByTestId("card-details").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByTestId("details-submit").click();
  await page.getByTestId("card-checkout").waitFor({ timeout: 30_000 });
  await settled(page);
  await shot(page, "03-checkout");
  await page.getByTestId("pay-button").click();
  await page.getByTestId("card-confirmation").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.waitForTimeout(1500);
  await shot(page, "04-booked", "booked");
  await page.getByTestId("xray-toggle").click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="xray-turn"] summary').first().click();
  await shot(page, "05-xray", "xray");
  await context.close();
}

async function emergency(browser: Browser): Promise<void> {
  console.log("emergency");
  const { page, context } = await open(browser, { width: 1440, height: 900 });
  await page.getByRole("button", { name: "I smell gas in my kitchen" }).click();
  await page.getByTestId("card-emergency").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByTestId("callback-open").click();
  await page.getByTestId("callback-submit").click();
  await page.getByTestId("card-handoff").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByTestId("card-emergency").scrollIntoViewIfNeeded();
  await shot(page, "06-emergency", "emergency");
  await context.close();
}

async function citations(browser: Browser): Promise<void> {
  console.log("citations");
  const { page, context } = await open(browser, { width: 1440, height: 900 });
  await page.getByRole("button", { name: "What's your warranty on repairs?" }).click();
  await page.getByTestId("citation-chip").first().waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByTestId("citation-chip").first().click();
  await page.getByTestId("citation-highlight").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await shot(page, "07-citations", "citation");
  await context.close();
}

async function spanish(browser: Browser): Promise<void> {
  console.log("spanish");
  const { page, context } = await open(browser, { width: 1440, height: 900 });
  await page.getByRole("button", { name: /Pueden arreglar/ }).click();
  await page.getByTestId("card-slots").waitFor({ timeout: 30_000 });
  await settled(page);
  await shot(page, "08-spanish");
  await context.close();
}

async function takeover(browser: Browser): Promise<void> {
  console.log("takeover");
  const { page, context } = await open(browser, { width: 1440, height: 900 });
  await say(page, "Do you service 97406?");
  await page.getByTestId("card-service-area").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByTestId("lead-lead-live").click();
  await page.getByTestId("take-over").click();
  await page.getByTestId("staff-input").fill("Hi, Sam here from Copperline. Yes, we're in Millbrook every day. I can fit you in first thing tomorrow.");
  await page.getByTestId("staff-send").click();
  await page.waitForTimeout(500);
  await shot(page, "09-takeover");
  await context.close();
}

async function owner(browser: Browser): Promise<void> {
  console.log("owner and customer views");
  const { page, context } = await open(browser, { width: 1440, height: 900 });
  await page.getByTestId("view-owner").click();
  await page.waitForTimeout(500);
  await shot(page, "10-owner");
  await page.getByTestId("view-customer").click();
  await page.waitForTimeout(500);
  await shot(page, "11-customer");
  await context.close();
}

async function mobile(browser: Browser): Promise<void> {
  console.log("mobile");
  const { page, context } = await open(browser, { width: 375, height: 812 }, { mobile: true });
  await shot(page, "12-mobile-start");
  await page.getByRole("button", { name: /My water heater is leaking/ }).click();
  await page.getByTestId("card-slots").waitFor({ timeout: 45_000 });
  await settled(page);
  await page.getByTestId("card-diagnosis").scrollIntoViewIfNeeded();
  await shot(page, "13-mobile-diagnosis");
  await page.getByTestId("view-owner").click();
  await page.waitForTimeout(500);
  await shot(page, "14-mobile-owner");
  await context.close();
}

/** A 1280x800 recording of the golden path, saved as docs/demo.webm. */
async function video(browser: Browser): Promise<void> {
  if (!VIDEO) return;
  console.log("walkthrough video");
  const dir = path.resolve("docs/.video-tmp");
  rmSync(dir, { recursive: true, force: true });
  const { page, context } = await open(browser, { width: 1280, height: 800 }, { video: dir });
  const pause = (ms: number) => page.waitForTimeout(ms);
  await pause(1500);
  await page.getByRole("button", { name: /My water heater is leaking/ }).click();
  await page.getByTestId("card-slots").waitFor({ timeout: 45_000 });
  await settled(page);
  await page.getByTestId("card-diagnosis").scrollIntoViewIfNeeded();
  await pause(2500);
  await page.getByTestId("card-slots").scrollIntoViewIfNeeded();
  await pause(1500);
  await page.getByTestId("slot-option").first().click();
  await page.getByTestId("card-details").waitFor({ timeout: 30_000 });
  await settled(page);
  await pause(1500);
  await page.getByTestId("details-submit").click();
  await page.getByTestId("card-checkout").waitFor({ timeout: 30_000 });
  await settled(page);
  await pause(1800);
  await page.getByTestId("pay-button").click();
  await page.getByTestId("card-confirmation").waitFor({ timeout: 30_000 });
  await settled(page);
  await pause(3500);
  const recording = page.video();
  await context.close();
  const file = await recording?.path();
  if (file) {
    renameSync(file, path.resolve("docs/demo.webm"));
    console.log("  saved docs/demo.webm");
  }
  rmSync(dir, { recursive: true, force: true });
}

const FLOWS: Record<string, (browser: Browser) => Promise<void>> = { golden, emergency, citations, spanish, takeover, owner, mobile, video };

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(WEB, { recursive: true });
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
