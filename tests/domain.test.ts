import { describe, expect, it } from "vitest";
import { applyPatches } from "@/lib/domain/patches";
import { SEEDED_BOOKING_CODE, freshLiveLead, seedJobs, seedLeads, seedOutbox } from "@/lib/domain/seed";
import { checkSlot, findSlots, parseSlotId, slotId } from "@/lib/domain/slots";
import { addDays, dayOfWeek, diffDays, fmtDayRelative, fmtTime, fmtWindow, icsLocal, isDayStr } from "@/lib/domain/time";
import type { Clock } from "@/lib/domain/types";
import { DOCS, locateQuote } from "@/lib/server/docs";
import { DIAGNOSTIC_FEE, SERVICES, buildEstimate, serviceByCode } from "@/lib/server/pricebook";

const clock: Clock = { today: "2026-11-17", nowMinutes: 630, tz: "UTC" };

describe("time helpers", () => {
  it("validates and shifts calendar days", () => {
    expect(isDayStr("2026-02-29")).toBe(false);
    expect(isDayStr("2028-02-29")).toBe(true);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-11-19", "2026-11-17")).toBe(2);
    expect(dayOfWeek("2026-11-17")).toBe(2);
  });
  it("formats times and windows", () => {
    expect(fmtTime(840)).toBe("2:00 PM");
    expect(fmtWindow(840, 120)).toBe("2:00–4:00 PM");
    expect(fmtWindow(600, 120)).toBe("10:00 AM–12:00 PM");
    expect(fmtDayRelative("2026-11-18", "2026-11-17")).toBe("Tomorrow");
    expect(fmtDayRelative("2026-11-18", "2026-11-17", "es")).toBe("Mañana");
    expect(icsLocal("2026-11-17", 840)).toBe("20261117T140000");
  });
});

describe("seed data", () => {
  const jobs = seedJobs(clock);
  it("matches the price book, which stays the single source of truth", () => {
    for (const job of jobs) {
      const service = serviceByCode(job.serviceCode);
      expect(service, job.serviceCode).toBeDefined();
      expect(job.serviceName).toBe(service!.name);
      expect([job.estLow, job.estHigh]).toEqual([service!.low, service!.high]);
      expect(job.feeDue).toBe(DIAGNOSTIC_FEE);
    }
  });
  it("has no double-booked technicians", () => {
    const keys = jobs.map((j) => `${j.techId}|${j.date}|${j.startMin}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("shows four jobs booked by Penny today and the reschedulable booking", () => {
    expect(jobs.filter((j) => j.source === "penny" && j.createdDay === clock.today)).toHaveLength(4);
    const seeded = jobs.find((j) => j.code === SEEDED_BOOKING_CODE);
    expect(seeded?.date).toBe(addDays(clock.today, 2));
  });
  it("seeds leads whose bookings exist", () => {
    for (const lead of seedLeads(clock)) {
      if (lead.jobCode) expect(jobs.some((j) => j.code === lead.jobCode), lead.id).toBe(true);
    }
    for (const message of seedOutbox(clock)) expect(jobs.some((j) => j.code === message.jobCode)).toBe(true);
  });
  it("never shows an 'earlier today' event in the future, even before dawn", () => {
    const night: Clock = { today: "2026-11-17", nowMinutes: 95, tz: "UTC" };
    for (const lead of seedLeads(night)) expect(lead.startedAtMin).toBeLessThanOrEqual(night.nowMinutes);
    for (const message of seedOutbox(night)) expect(message.atMin).toBeLessThanOrEqual(night.nowMinutes);
    for (const job of seedJobs(night)) if (job.createdDay === night.today) expect(job.createdAtMin).toBeLessThanOrEqual(night.nowMinutes);
    const morning = seedLeads(clock).map((l) => l.startedAtMin);
    expect(morning).toContain(548);
  });
});

describe("slots", () => {
  const jobs = seedJobs(clock);
  it("offers Marcus at 2 PM today as the earliest plumbing window mid-morning", () => {
    const slots = findSlots({ trade: "plumbing", jobs, clock });
    expect(slots[0]).toMatchObject({ techId: "marcus", date: clock.today, startMin: 840 });
    expect(slots).toHaveLength(4);
    expect(new Set(slots.map((s) => `${s.date}|${s.startMin}`)).size).toBe(4);
  });
  it("never offers a window that has started or is too close", () => {
    const late: Clock = { ...clock, nowMinutes: 16 * 60 + 30 };
    const slots = findSlots({ trade: "plumbing", jobs, clock: late });
    expect(slots.every((s) => s.date !== late.today)).toBe(true);
  });
  it("honours a preferred day when it has openings", () => {
    const tomorrow = addDays(clock.today, 1);
    const slots = findSlots({ trade: "hvac", jobs, clock, preferredDate: tomorrow });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.date === tomorrow)).toBe(true);
  });
  it("re-checks a slot the client claims is free", () => {
    expect(checkSlot(slotId("marcus", clock.today, 720), "plumbing", jobs, clock)).toEqual({ ok: false, problem: "taken" });
    expect(checkSlot(slotId("marcus", clock.today, 480), "plumbing", jobs, clock)).toEqual({ ok: false, problem: "in_the_past" });
    expect(checkSlot(slotId("priya", clock.today, 960), "plumbing", jobs, clock)).toEqual({ ok: false, problem: "wrong_trade" });
    expect(checkSlot(slotId("marcus", addDays(clock.today, 9), 480), "plumbing", jobs, clock)).toEqual({ ok: false, problem: "outside_horizon" });
    expect(checkSlot("marcus|2026-11-17|845", "plumbing", jobs, clock)).toEqual({ ok: false, problem: "unknown_slot" });
    expect(checkSlot("nobody|2026-11-17|840", "plumbing", jobs, clock)).toEqual({ ok: false, problem: "unknown_slot" });
    expect(parseSlotId("marcus|2026-11-17|840")).toEqual({ techId: "marcus", date: "2026-11-17", startMin: 840 });
  });
});

describe("price book", () => {
  it("has about fifteen services with sane ranges and unique codes", () => {
    expect(SERVICES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(SERVICES.map((s) => s.code)).size).toBe(SERVICES.length);
    for (const s of SERVICES) expect(s.low).toBeLessThan(s.high);
  });
  it("applies the member discount and after-hours surcharge", () => {
    const service = serviceByCode("WH-REPAIR")!;
    expect(buildEstimate(service, { afterHours: false, member: false })).toMatchObject({ low: 180, high: 450, diagnosticFee: 89 });
    expect(buildEstimate(service, { afterHours: false, member: true })).toMatchObject({ low: 155, high: 385, diagnosticFee: 0 });
    expect(buildEstimate(service, { afterHours: true, member: false })).toMatchObject({ low: 275, high: 545 });
  });
});

describe("documents", () => {
  it("has the eight company documents", () => {
    expect(DOCS.map((d) => d.id)).toEqual(["pricing", "service-area", "warranty", "booking-policy", "emergency", "faq", "financing", "care-club"]);
  });
  it("generates the pricing guide from the price book", () => {
    const pricing = DOCS[0].text;
    for (const s of SERVICES) expect(pricing).toContain(`${s.name} (${s.code}): $${s.low.toLocaleString("en-US")} to $${s.high.toLocaleString("en-US")}.`);
    expect(locateQuote("pricing", "nope")).toBeNull();
  });
});

describe("patches", () => {
  it("applies and is idempotent for adds", () => {
    const jobs = seedJobs(clock);
    const base = { jobs, lead: freshLiveLead(clock), outbox: [], alerts: [] };
    const job = { ...jobs[0], id: "CPL-9000", code: "CPL-9000" };
    const once = applyPatches(base, [{ op: "job.add", job }, { op: "job.add", job }]);
    expect(once.jobs).toHaveLength(jobs.length + 1);
    const updated = applyPatches(once, [
      { op: "job.update", code: "CPL-9000", changes: { status: "cancelled" } },
      { op: "lead.update", changes: { status: "booked" } },
    ]);
    expect(updated.jobs.find((j) => j.code === "CPL-9000")?.status).toBe("cancelled");
    expect(updated.lead.status).toBe("booked");
    expect(base.jobs).toHaveLength(jobs.length);
  });
});
