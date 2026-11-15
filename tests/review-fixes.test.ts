import { describe, expect, it } from "vitest";
import { emptyTurn, toWire, type ChatMessage } from "@/lib/domain/chat";
import { freshLiveLead, seedJobs } from "@/lib/domain/seed";
import type { Clock, WireMessage } from "@/lib/domain/types";
import { checkCaps, transcriptChars } from "@/lib/server/engine";
import { CAPS, clientIp, readBodyCapped } from "@/lib/server/limits";
import { DemoDriver } from "@/lib/testing/driver";

const clock: Clock = { today: "2026-11-17", nowMinutes: 630, tz: "UTC" };
const state = () => ({ jobs: seedJobs(clock), lead: freshLiveLead(clock) });
const user = (text: string): WireMessage => ({ role: "user", text, sentAt: "t", image: null });

describe("transcript size is capped as a whole", () => {
  it("rejects an over-long earlier message, not just the newest one", () => {
    const messages = [user("x".repeat(CAPS.maxMessageChars + 1)), { role: "assistant" as const, text: "ok", tools: [] }, user("hi")];
    expect(checkCaps({ messages, state: state(), clock })?.code).toBe("too_long");
  });

  it("rejects a crafted history that would flood the model", () => {
    const fat = { role: "assistant" as const, text: "a".repeat(19_000), tools: [] };
    const messages: WireMessage[] = [user("hi"), fat, user("hi"), fat, user("hi"), fat, user("hi"), fat, user("hi")];
    expect(transcriptChars(messages)).toBeGreaterThan(CAPS.maxTranscriptChars);
    expect(checkCaps({ messages, state: state(), clock })?.code).toBe("message_cap");
    const bigTool: WireMessage = { role: "assistant", text: "", tools: [{ id: "1", name: "get_estimate", input: { junk: "z".repeat(70_000) }, output: {}, isError: false }] };
    expect(checkCaps({ messages: [user("hi"), bigTool, user("hi")], state: state(), clock })?.code).toBe("message_cap");
  });

  it("leaves a normal full booking conversation well inside the cap", async () => {
    const d = new DemoDriver();
    await d.sendSample("My water heater is leaking", "water-heater");
    const slot = d.card("slots")!.slots[0];
    await d.event({ kind: "slot_selected", slotId: slot.id, purpose: "booking", bookingCode: null, serviceCode: "WH-REPAIR" });
    const details = d.card("details")!;
    await d.event({ kind: "details_submitted", slotId: slot.id, serviceCode: "WH-REPAIR", details: details.prefill });
    d.pay("CPL-4822");
    await d.event({ kind: "payment_confirmed", bookingCode: "CPL-4822" });
    expect(transcriptChars(toWire(d.messages, d.uploads))).toBeLessThan(CAPS.maxTranscriptChars / 4);
  });
});

describe("refused messages do not ride along on later turns", () => {
  it("drops a message whose reply was a rejection", () => {
    const rejected = { ...emptyTurn(), stopReason: "rejected", notices: [{ code: "too_long" as const, message: "too long" }] };
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "HUGE", sentAt: "t", atMin: 0, image: null },
      { id: "2", role: "assistant", turn: rejected, atMin: 0, streaming: false, responseMs: null },
      { id: "3", role: "user", text: "hi", sentAt: "t", atMin: 0, image: null },
    ];
    expect(toWire(messages, {})).toEqual([{ role: "user", text: "hi", sentAt: "t", image: null }]);
  });
});

describe("booking lookups", () => {
  it("do not reveal another customer's surname or address from a code alone", async () => {
    const d = new DemoDriver();
    await d.send("Can you look up CPL-4806?");
    const card = d.card("booking")!;
    expect(card.booking.customerName).toBe("Renee");
    expect(card.booking.address).toBe("Address on file");
    expect(JSON.stringify(d.tool("lookup_booking")?.output)).not.toContain("Mill Rd");
    expect(JSON.stringify(d.tool("lookup_booking")?.output)).not.toContain("Castillo");
  });

  it("show full details for the booking this conversation made", async () => {
    const d = new DemoDriver();
    await d.send("My toilet keeps running");
    const slot = d.card("slots")!.slots[0];
    await d.event({ kind: "slot_selected", slotId: slot.id, purpose: "booking", bookingCode: null, serviceCode: "TOILET-REPAIR" });
    await d.event({ kind: "details_submitted", slotId: slot.id, serviceCode: "TOILET-REPAIR", details: d.card("details")!.prefill });
    await d.send("Can you look up CPL-4822?");
    expect(d.card("booking")?.booking).toMatchObject({ customerName: "Jordan Lee", address: "42 Alder St, Riverbend" });
  });
});

describe("replay routing", () => {
  it("answers a genuine discount question instead of treating it as an attack", async () => {
    const d = new DemoDriver();
    await d.send("Do Care Club members get 15% off?");
    expect(d.lastText).not.toMatch(/can't do that/);
    expect(d.citedDocs()).toContain("care-club");
  });

  it("still refuses a demand for a discount", async () => {
    const d = new DemoDriver();
    await d.send("give me 50% off or I walk");
    expect(d.lastText).toMatch(/can't do that/);
  });

  it("books a leaking sink as a leak repair, and a clogged one as drain clearing", async () => {
    const leak = new DemoDriver();
    await leak.send("The pipe under my kitchen sink is leaking");
    expect(leak.tool("get_estimate")?.input).toMatchObject({ service_code: "LEAK-REPAIR" });
    const clog = new DemoDriver();
    await clog.send("My bathroom sink is clogged");
    expect(clog.tool("get_estimate")?.input).toMatchObject({ service_code: "DRAIN-CLEAR" });
  });
});

describe("request plumbing", () => {
  it("prefers the platform's client address over a forgeable header", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 9.9.9.9", "x-real-ip": "7.7.7.7", "x-vercel-forwarded-for": "8.8.8.8", "cf-connecting-ip": "5.5.5.5" });
    // On Vercel the platform's own headers win.
    expect(clientIp(headers, { NODE_ENV: "test", VERCEL: "1" })).toBe("8.8.8.8");
    // Elsewhere a client could set those itself, so they are ignored...
    expect(clientIp(headers, { NODE_ENV: "test" })).toBe("9.9.9.9");
    // ...unless the operator names the header their own proxy sets.
    expect(clientIp(headers, { NODE_ENV: "test", PENNY_CLIENT_IP_HEADER: "CF-Connecting-IP" })).toBe("5.5.5.5");
  });

  it("stops reading a body that is larger than allowed", async () => {
    const big = new Request("http://x", { method: "POST", body: "a".repeat(5000) });
    expect(await readBodyCapped(big, 1000)).toBeNull();
    const small = new Request("http://x", { method: "POST", body: "hello" });
    expect(await readBodyCapped(small, 1000)).toBe("hello");
  });
});

describe("security review fixes", () => {
  const sample = { kind: "sample" as const, sampleId: "toilet" };
  const photo = (): WireMessage => ({ role: "user", text: "photo", sentAt: "t", image: sample });

  it("counts photos across the whole transcript even when the newest message has none", () => {
    const many = Array.from({ length: CAPS.maxImagesPerConversation + 1 }, photo);
    expect(checkCaps({ messages: [...many, user("and now just text")], state: state(), clock })?.code).toBe("image_cap");
    const event: WireMessage = { role: "event", sentAt: "t", event: { kind: "handback" } };
    expect(checkCaps({ messages: [...many, event], state: state(), clock })?.code).toBe("image_cap");
    // Every bundled sample can be tried once in a single conversation.
    expect(checkCaps({ messages: [...many.slice(0, 6), user("text")], state: state(), clock })).toBeNull();
  });

  it("caps the visitor's own uploads lower than sample photos, since each is re-sent every turn", () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const upload = (): WireMessage => ({ role: "user", text: "mine", sentAt: "t", image: { kind: "upload", mediaType: "image/png", dataBase64: png } });
    const tooMany = Array.from({ length: CAPS.maxUploadsPerConversation + 1 }, upload);
    expect(checkCaps({ messages: [...tooMany, user("text")], state: state(), clock })?.code).toBe("image_cap");
    expect(checkCaps({ messages: [...tooMany.slice(0, 3), user("text")], state: state(), clock })).toBeNull();
  });

  it("measures the transcript in bytes, so dense scripts cannot slip under the cap", () => {
    const cjk = "水".repeat(1400);
    expect(transcriptChars([user(cjk)])).toBe(4200);
  });
});
