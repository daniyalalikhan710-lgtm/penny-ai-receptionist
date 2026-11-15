/**
 * Automated WCAG 2.1 A/AA scan (axe-core) of the main screens and states.
 *
 *   pnpm a11y [--url http://localhost:3000]
 *
 * Automated checks catch roughly a third of accessibility problems; this is a
 * floor, not proof. Exits 1 when any violation is found.
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const BASE = urlIndex >= 0 && args[urlIndex + 1] ? args[urlIndex + 1] : "http://localhost:3000";

function tenThirtyToday(): Date {
  const d = new Date();
  d.setHours(10, 30, 0, 0);
  return d;
}

let failures = 0;

async function scan(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    // The Next.js dev overlay is not part of the app.
    .exclude("nextjs-portal")
    .analyze();
  const violations = results.violations;
  console.log((violations.length === 0 ? "  PASS  " : "  FAIL  ") + label + (violations.length ? " (" + violations.length + " rule" + (violations.length > 1 ? "s" : "") + ")" : ""));
  for (const v of violations) {
    failures += 1;
    console.log("        " + v.id + " [" + (v.impact ?? "n/a") + "] " + v.help);
    for (const node of v.nodes.slice(0, 4)) {
      console.log("          " + node.target.join(" ") + "\n            " + (node.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 260));
    }
    if (v.nodes.length > 4) console.log("          … and " + (v.nodes.length - 4) + " more");
  }
}

async function settled(page: Page): Promise<void> {
  await page.locator('[data-testid="chat-widget"][data-busy="false"]').waitFor({ timeout: 45_000 });
}

async function fresh(viewport: { width: number; height: number }, mobile = false): Promise<Page> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.clock.install({ time: tenThirtyToday() });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByTestId("chat-widget").waitFor();
  return page;
}

async function main(): Promise<void> {
  console.log("\naxe-core scan · " + BASE + "\n");

  let page = await fresh({ width: 1440, height: 900 });
  await scan(page, "split view, empty chat");
  await page.getByRole("button", { name: /My water heater is leaking/ }).click();
  await page.getByTestId("card-slots").waitFor({ timeout: 45_000 });
  await settled(page);
  await scan(page, "diagnosis + slot picker");
  await page.getByTestId("slot-option").first().click();
  await page.getByTestId("card-details").waitFor();
  await settled(page);
  await page.getByTestId("details-submit").click();
  await page.getByTestId("card-checkout").waitFor();
  await settled(page);
  await scan(page, "details + checkout forms");
  await page.getByTestId("pay-button").click();
  await page.getByTestId("card-confirmation").waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByTestId("xray-toggle").click();
  await scan(page, "confirmation + X-ray panel");
  await page.getByTestId("xray-toggle").click();
  await page.getByTestId("lead-lead-live").click();
  await page.getByTestId("take-over").click();
  await scan(page, "inbox conversation, taken over");
  await page.locator('[data-testid="job-card"]').first().click();
  await page.getByRole("dialog").waitFor();
  await scan(page, "job detail dialog");
  await page.context().browser()?.close();

  page = await fresh({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "I smell gas in my kitchen" }).click();
  await page.getByTestId("card-emergency").waitFor();
  await settled(page);
  await page.getByTestId("callback-open").click();
  await scan(page, "emergency card + dashboard alert");
  await page.context().browser()?.close();

  page = await fresh({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "What's your warranty on repairs?" }).click();
  await page.getByTestId("citation-chip").first().waitFor();
  await settled(page);
  await page.getByTestId("citation-chip").first().click();
  await page.getByTestId("citation-highlight").first().waitFor();
  await scan(page, "citation drawer");
  await page.context().browser()?.close();

  page = await fresh({ width: 1440, height: 900 });
  await page.getByTestId("view-owner").click();
  await scan(page, "owner view");
  await page.getByTestId("view-customer").click();
  await page.getByTestId("photo-button").click();
  await scan(page, "customer view + photo tray");
  await page.goto(BASE + "/case-study", { waitUntil: "networkidle" });
  await scan(page, "case study page");
  await page.context().browser()?.close();

  page = await fresh({ width: 375, height: 812 }, true);
  await scan(page, "mobile, customer tab");
  await page.getByTestId("view-owner").click();
  await scan(page, "mobile, owner tab");
  await page.context().browser()?.close();

  console.log("\n" + (failures === 0 ? "No automated violations." : failures + " violation group(s) found."));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
