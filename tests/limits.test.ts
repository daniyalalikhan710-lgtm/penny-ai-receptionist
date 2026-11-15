import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatRequestSchema } from "@/lib/domain/schemas";
import { freshLiveLead, seedJobs } from "@/lib/domain/seed";
import { clockFromDate, fmtStamp } from "@/lib/domain/time";
import type { Clock, StreamEvent, WireMessage } from "@/lib/domain/types";
import { checkCaps, resolveMode, runTurn } from "@/lib/server/engine";
import { CAPS, RATE, checkRate, clientIp, resetRateMemory } from "@/lib/server/limits";
import { POST as chatPost } from "@/app/api/chat/route";
import { POST as payPost } from "@/app/api/pay/route";

const clock: Clock = { today: "2026-11-17", nowMinutes: 630, tz: "UTC" };
type UserImage = Extract<WireMessage, { role: "user" }>["image"];
const user = (text: string, image: UserImage = null): WireMessage => ({ role: "user", text, sentAt: "t", image });
const state = () => ({ jobs: seedJobs(clock), lead: freshLiveLead(clock) });

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("caps", () => {
  it("rejects an over-long message with a friendly notice", () => {
    const rejection = checkCaps({ messages: [user("x".repeat(CAPS.maxMessageChars + 1))], state: state(), clock });
    expect(rejection?.code).toBe("too_long");
    expect(rejection?.message).toMatch(/short version/);
  });

  it("caps the number of turns in a conversation", () => {
    const messages: WireMessage[] = [];
    for (let i = 0; i <= CAPS.maxUserTurns; i++) {
      messages.push(user(`message ${i}`));
      if (i < CAPS.maxUserTurns) messages.push({ role: "assistant", text: "ok", tools: [] });
    }
    expect(checkCaps({ messages, state: state(), clock })?.code).toBe("message_cap");
    expect(checkCaps({ messages: messages.slice(0, 5), state: state(), clock })).toBeNull();
  });

  it("caps photos per conversation", () => {
    const sample = { kind: "sample" as const, sampleId: "toilet" };
    const messages = Array.from({ length: CAPS.maxImagesPerConversation + 1 }, () => user("photo", sample));
    expect(checkCaps({ messages, state: state(), clock })?.code).toBe("image_cap");
  });

  it("validates uploads by size and by magic bytes, not by the claimed type", () => {
    const ok = user("look", { kind: "upload", mediaType: "image/png", dataBase64: PNG_1PX });
    expect(checkCaps({ messages: [ok], state: state(), clock })).toBeNull();
    const lying = user("look", { kind: "upload", mediaType: "image/jpeg", dataBase64: PNG_1PX });
    expect(checkCaps({ messages: [lying], state: state(), clock })?.code).toBe("upload_invalid");
    const notBase64 = user("look", { kind: "upload", mediaType: "image/png", dataBase64: "<script>alert(1)</script>" });
    expect(checkCaps({ messages: [notBase64], state: state(), clock })?.code).toBe("upload_invalid");
    const huge = user("look", { kind: "upload", mediaType: "image/png", dataBase64: PNG_1PX.slice(0, 20) + "A".repeat(2_050_000) });
    expect(checkCaps({ messages: [huge], state: state(), clock })?.code).toBe("upload_invalid");
  });

  it("emits a complete stream when a turn is rejected", async () => {
    const events: StreamEvent[] = [];
    await runTurn({ messages: [user("x".repeat(5000))], state: state(), clock }, (e) => events.push(e), { mode: "replay", replayPace: 0 });
    expect(events.map((e) => e.type)).toEqual(["meta", "notice", "done"]);
  });
});

describe("mode selection", () => {
  it("is live only when a key is present and replay is not forced", () => {
    expect(resolveMode({ NODE_ENV: "test" })).toBe("replay");
    expect(resolveMode({ NODE_ENV: "test", ANTHROPIC_API_KEY: "  " })).toBe("replay");
    expect(resolveMode({ NODE_ENV: "test", ANTHROPIC_API_KEY: "sk-test" })).toBe("live");
    expect(resolveMode({ NODE_ENV: "test", ANTHROPIC_API_KEY: "sk-test", PENNY_MODE: "replay" })).toBe("replay");
  });
});

describe("rate limiting", () => {
  beforeEach(() => resetRateMemory());

  it("allows a burst up to the per-minute limit, then blocks", async () => {
    const now = 1_800_000_000_000;
    for (let i = 0; i < RATE.perMinute; i++) expect((await checkRate("1.2.3.4", now + i)).ok).toBe(true);
    const blocked = await checkRate("1.2.3.4", now + 100);
    expect(blocked).toMatchObject({ ok: false, scope: "minute" });
    expect((await checkRate("5.6.7.8", now)).ok).toBe(true);
    expect((await checkRate("1.2.3.4", now + 61_000)).ok).toBe(true);
  });

  it("reads the client address from proxy headers", () => {
    // The right-most entry is the one the nearest proxy added; the left-most is client-supplied.
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }), { NODE_ENV: "test" })).toBe("10.0.0.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("API routes", () => {
  const now = new Date();
  const liveClock = clockFromDate(now);
  const liveState = () => ({ jobs: seedJobs(liveClock), lead: freshLiveLead(liveClock) });
  const post = (handler: (r: Request) => Promise<Response>, body: unknown, ip = "20.0.0.1") =>
    handler(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  const chatBody = (text: string) => ({ messages: [{ role: "user", text, sentAt: fmtStamp(liveClock), image: null }], state: liveState(), clock: liveClock });

  beforeEach(() => {
    resetRateMemory();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("PENNY_MODE", "replay");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function readEvents(response: Response): Promise<StreamEvent[]> {
    const text = await response.text();
    return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as StreamEvent);
  }

  it("streams a replay turn as NDJSON", async () => {
    const response = await post(chatPost, chatBody("Do you service 97406?"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("ndjson");
    const events = await readEvents(response);
    expect(events[0]).toMatchObject({ type: "meta", mode: "replay" });
    expect(events.some((e) => e.type === "tool_result" && e.name === "check_service_area")).toBe(true);
    expect(events[events.length - 1].type).toBe("done");
  });

  it("rejects malformed bodies, unknown shapes and a wrong clock", async () => {
    expect((await post(chatPost, "not json")).status).toBe(400);
    expect((await post(chatPost, { messages: [], state: liveState(), clock: liveClock })).status).toBe(400);
    expect((await post(chatPost, { ...chatBody("hi"), clock: { ...liveClock, today: "2020-01-01" } })).status).toBe(400);
    const tampered = chatBody("hi");
    tampered.state.jobs[0] = { ...tampered.state.jobs[0], techId: "mallory" };
    expect((await post(chatPost, tampered)).status).toBe(400);
    expect(chatRequestSchema.safeParse({ ...chatBody("hi"), extra: 1 }).success).toBe(true);
  });

  it("rate-limits rapid-fire requests with a friendly notice", async () => {
    let last: Response | null = null;
    for (let i = 0; i <= RATE.perMinute; i++) last = await post(chatPost, chatBody("hi"), "30.0.0.9");
    expect(last!.status).toBe(429);
    const events = await readEvents(last!);
    expect(events[1]).toMatchObject({ type: "notice", code: "rate_limited" });
    expect((events[1] as { message: string }).message).toMatch(/Demo limit reached/);
  });

  it("stays quiet while a person has taken over the chat", async () => {
    const body = chatBody("hello?");
    body.state.lead = { ...body.state.lead, status: "human" };
    const events = await readEvents(await post(chatPost, body));
    expect(events.some((e) => e.type === "text")).toBe(false);
  });

  it("takes payment only for a real held booking with the test card, at the price-book fee", async () => {
    const jobs = seedJobs(liveClock);
    const held = { ...jobs[0], id: "CPL-4822", code: "CPL-4822", status: "pending_payment" as const, feePaid: false, feeDue: 1, date: liveClock.today, startMin: 960, techId: "marcus", conversationId: "lead-live" };
    const base = { state: { jobs: [...jobs, held], lead: freshLiveLead(liveClock) }, clock: liveClock };
    const card = { name: "Jordan Lee", number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" };

    const missing = await (await post(payPost, { ...base, bookingCode: "CPL-9999", card })).json();
    expect(missing.ok).toBe(false);
    const realCard = await (await post(payPost, { ...base, bookingCode: "CPL-4822", card: { ...card, number: "4111 1111 1111 1111" } })).json();
    expect(realCard).toMatchObject({ ok: false });
    expect(realCard.reason).toMatch(/test card/);
    const badExpiry = await (await post(payPost, { ...base, bookingCode: "CPL-4822", card: { ...card, expiry: "soon" } })).json();
    expect(badExpiry.ok).toBe(false);

    const paid = await (await post(payPost, { ...base, bookingCode: "CPL-4822", card })).json();
    expect(paid).toMatchObject({ ok: true, amount: 89, last4: "4242" });
    // The client claimed a $1 fee; the server charges the price book's fee.
    expect(paid.patches[0]).toMatchObject({ op: "job.update", code: "CPL-4822", changes: { status: "confirmed", feePaid: true, feeDue: 89 } });
    expect(JSON.stringify(paid)).not.toContain("4242 4242");

    const already = await (await post(payPost, { ...base, state: { ...base.state, jobs: jobs }, bookingCode: jobs[0].code, card })).json();
    expect(already.ok).toBe(false);
  });
});
