import { expect, test, type Page } from "@playwright/test";

function tenThirtyToday(): Date {
  const d = new Date();
  d.setHours(10, 30, 0, 0);
  return d;
}

async function openDemo(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  // Mid-morning, so the earliest plumbing window is Marcus at 2 PM today.
  await page.clock.install({ time: tenThirtyToday() });
  await page.goto("/");
  await expect(page.getByTestId("chat-widget")).toBeVisible();
  await expect(page.getByTestId("replay-pill")).toBeVisible();
  return errors;
}

async function settled(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="chat-widget"][data-busy="false"]')).toBeVisible({ timeout: 45_000 });
}

test("golden path: photo → diagnosis → booking → payment → dispatch board", async ({ page }) => {
  const errors = await openDemo(page);

  await expect(page.getByTestId("kpi-booked")).toHaveAttribute("data-value", "4");
  await expect(page.getByTestId("kpi-revenue")).toHaveAttribute("data-value", "1259");
  await expect(page.getByTestId("demo-banner")).toContainText("Copperline is a fictional business");

  // 1. Tap the suggested prompt, which attaches the sample photo.
  await page.getByRole("button", { name: /My water heater is leaking/ }).click();

  // 2. Diagnosis card with an estimate from the price book.
  const diagnosis = page.getByTestId("card-diagnosis");
  await expect(diagnosis).toBeVisible();
  await expect(diagnosis.getByTestId("estimate-range")).toHaveText("$180–$450");
  await expect(diagnosis).toContainText("What to do right now");

  // 3. Slot picker: earliest is Marcus, today 2–4 PM.
  const firstSlot = page.getByTestId("slot-option").first();
  await expect(firstSlot).toContainText("Today · 2:00–4:00 PM");
  await expect(firstSlot).toContainText("Marcus Reyes");
  await settled(page);
  await firstSlot.click();

  // 4. Details card prefilled with the demo customer.
  const details = page.getByTestId("card-details");
  await expect(details).toBeVisible();
  await expect(details.getByLabel("Full name")).toHaveValue("Jordan Lee");
  await settled(page);
  await page.getByTestId("details-submit").click();

  // 5. Checkout for the $89 diagnostic fee; the job is held on the board.
  const checkout = page.getByTestId("card-checkout");
  await expect(checkout).toBeVisible();
  await expect(checkout).toContainText("$89");
  await expect(checkout.getByLabel("Card number")).toHaveValue("4242 4242 4242 4242");
  const held = page.locator('[data-job-code="CPL-4822"]');
  await expect(held).toHaveAttribute("data-status", "pending_payment");
  await expect(page.getByTestId("kpi-booked")).toHaveAttribute("data-value", "4");
  await settled(page);
  await page.getByTestId("pay-button").click();

  // 6. Confirmation card with booking code, calendar link and SMS preview.
  const confirmation = page.getByTestId("card-confirmation");
  await expect(confirmation).toBeVisible({ timeout: 30_000 });
  await expect(confirmation.getByTestId("booking-code")).toHaveText("CPL-4822");
  await expect(confirmation.getByTestId("sms-preview")).toContainText("CPL-4822");
  await expect(confirmation.getByRole("link", { name: "Add to calendar" })).toHaveAttribute("download", "copperline-CPL-4822.ics");

  // 7. Meanwhile, on the owner's side.
  await expect(held).toHaveAttribute("data-status", "confirmed");
  const cell = page.locator(`[data-job-cell^="marcus|"][data-job-cell$="|840"]`);
  await expect(cell.locator('[data-job-code="CPL-4822"]')).toBeVisible();
  await expect(page.getByTestId("kpi-booked")).toHaveAttribute("data-value", "5");
  await expect(page.getByTestId("kpi-revenue")).toHaveAttribute("data-value", "1574");
  await expect(page.getByTestId("lead-lead-live")).toHaveAttribute("data-status", "booked");
  await expect(page.getByTestId("outbox-item").first()).toContainText("CPL-4822");

  // The sandbox survives a reload, and Reset demo clears it.
  await settled(page);
  await page.reload();
  await expect(page.getByTestId("kpi-booked")).toHaveAttribute("data-value", "5");
  await expect(page.getByTestId("card-confirmation")).toBeVisible();
  await page.getByTestId("reset-demo").click();
  await page.getByTestId("reset-demo").click();
  await expect(page.getByTestId("kpi-booked")).toHaveAttribute("data-value", "4");
  await expect(page.getByTestId("card-confirmation")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("emergency: gas smell leads with safety and alerts the owner", async ({ page }) => {
  const errors = await openDemo(page);
  await page.getByRole("button", { name: "I smell gas in my kitchen" }).click();
  const card = page.getByTestId("card-emergency");
  await expect(card).toBeVisible();
  await expect(card).toContainText("leave the building now");
  await expect(card).toContainText("911");
  await expect(page.getByTestId("card-slots")).toHaveCount(0);
  const alert = page.getByTestId("emergency-alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Gas smell reported");
  await settled(page);
  await page.getByTestId("callback-open").click();
  await page.getByTestId("callback-submit").click();
  await expect(page.getByTestId("card-handoff")).toBeVisible();
  await expect(page.getByTestId("alert-callback")).toContainText("(555) 010-0142");
  expect(errors).toEqual([]);
});

test("citations: a chip opens the source document with the passage highlighted", async ({ page }) => {
  const errors = await openDemo(page);
  await page.getByRole("button", { name: "What's your warranty on repairs?" }).click();
  await settled(page);
  await page.getByTestId("citation-chip").first().click();
  const drawer = page.getByTestId("citation-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Warranty & Satisfaction Guarantee");
  await expect(page.getByTestId("citation-highlight").first()).toHaveText("All repairs carry a 2-year warranty on parts and labor.");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  expect(errors).toEqual([]);
});

test("human takeover: the owner replies, hands back, and Penny knows what was said", async ({ page }) => {
  const errors = await openDemo(page);
  await page.getByTestId("chat-input").fill("Do you service 97406?");
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("card-service-area")).toContainText("Millbrook");
  await settled(page);

  await page.getByTestId("lead-lead-live").click();
  await page.getByTestId("take-over").click();
  await expect(page.getByTestId("system-message").last()).toContainText("Sam from Copperline joined the chat");

  // While Sam is in the chat, Penny stays quiet.
  await page.getByTestId("chat-input").fill("Can someone come tomorrow morning?");
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("lead-detail")).toContainText("Can someone come tomorrow morning?");
  await page.waitForTimeout(800);
  await expect(page.getByTestId("assistant-message")).toHaveCount(1);

  await page.getByTestId("staff-input").fill("Sam here. Yes, I have 8 AM tomorrow held for you.");
  await page.getByTestId("staff-send").click();
  await expect(page.getByTestId("staff-message")).toContainText("8 AM tomorrow held for you");

  await page.getByTestId("hand-back").click();
  await expect(page.getByTestId("assistant-message").last()).toContainText("8 AM tomorrow held for you", { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("Spanish request and rescheduling CPL-4821", async ({ page }) => {
  const errors = await openDemo(page);
  await page.getByRole("button", { name: /Pueden arreglar/ }).click();
  await expect(page.getByTestId("card-slots")).toContainText("Mañana");
  await expect(page.getByTestId("lead-lead-live").getByTestId("lead-summary")).toContainText("Customer (writing in Spanish)");
  await settled(page);

  await page.getByTestId("reset-demo").click();
  await page.getByTestId("reset-demo").click();
  await page.getByRole("button", { name: /Reschedule my appointment/ }).click();
  await expect(page.getByTestId("card-booking")).toContainText("CPL-4821");
  await settled(page);
  await page.getByTestId("slot-option").nth(1).click();
  await expect(page.getByTestId("card-confirmation")).toContainText("Visit rescheduled");
  expect(errors).toEqual([]);
});

test("mobile: tabs instead of a split screen, and the chat fits 375px", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.clock.install({ time: tenThirtyToday() });
  await page.goto("/");
  await expect(page.getByTestId("chat-widget")).toBeVisible();
  await expect(page.getByTestId("view-split")).toHaveCount(0);
  await expect(page.getByTestId("dashboard")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId("view-owner").click();
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByTestId("kpi-booked")).toHaveAttribute("data-value", "4");
  const ownerOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(ownerOverflow).toBeLessThanOrEqual(0);

  // The emergency banner must stay readable on a phone.
  await page.getByTestId("view-customer").click();
  await page.getByRole("button", { name: "I smell gas in my kitchen" }).click();
  await expect(page.getByTestId("card-emergency")).toBeVisible();
  await page.getByTestId("view-owner").click();
  const alert = page.getByTestId("emergency-alert");
  await expect(alert).toBeVisible();
  const box = await alert.boundingBox();
  expect(box?.height ?? 999).toBeLessThan(260);
  await context.close();
});
