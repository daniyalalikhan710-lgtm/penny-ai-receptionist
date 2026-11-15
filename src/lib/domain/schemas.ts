import { z } from "zod";
import { isDayStr } from "./time";

/**
 * zod schemas for everything that crosses the network. The server parses the
 * whole request with these before any of it reaches a tool or the model.
 */

const day = z.string().refine(isDayStr, "Expected a YYYY-MM-DD date");
const shortText = z.string().max(200);
const urgency = z.enum(["routine", "soon", "urgent", "emergency"]);

export const clockSchema = z.object({
  today: day,
  nowMinutes: z.number().int().min(0).max(1439),
  tz: z.string().max(64),
});

const photoRefSchema = z.union([
  z.object({ kind: z.literal("sample"), sampleId: z.string().max(40) }),
  z.object({ kind: z.literal("upload") }),
]);

export const jobSchema = z.object({
  id: z.string().max(20),
  code: z.string().regex(/^CPL-\d{4,6}$/),
  techId: z.string().max(20),
  date: day,
  startMin: z.number().int().min(0).max(1439),
  durationMin: z.number().int().min(30).max(480),
  serviceCode: z.string().max(30),
  serviceName: z.string().max(80),
  customerName: shortText,
  address: shortText,
  phone: z.string().max(40),
  email: z.string().max(120),
  urgency,
  status: z.enum(["pending_payment", "confirmed", "cancelled"]),
  source: z.enum(["penny", "phone", "web"]),
  summary: z.string().max(400),
  photo: photoRefSchema.nullable(),
  estLow: z.number().min(0).max(100_000),
  estHigh: z.number().min(0).max(100_000),
  feeDue: z.number().min(0).max(1000),
  feePaid: z.boolean(),
  createdDay: day,
  createdAtMin: z.number().int().min(0).max(1439),
  conversationId: z.string().max(40).nullable(),
});

export const leadSchema = z.object({
  id: z.string().max(40),
  customerName: shortText,
  channel: z.enum(["Website chat", "SMS"]),
  startedDay: day,
  startedAtMin: z.number().int().min(0).max(1439),
  summary: z.string().max(600),
  intent: z.enum(["booking", "question", "pricing", "emergency", "reschedule", "cancel", "other"]),
  urgency,
  status: z.enum(["penny", "needs_human", "human", "booked", "resolved"]),
  language: z.enum(["en", "es"]),
  emergency: z.boolean(),
  jobCode: z.string().max(20).nullable(),
  callbackPhone: z.string().max(40).nullable(),
  transcript: z.array(z.object({ from: z.enum(["customer", "penny", "staff"]), text: z.string().max(2000) })).max(50),
  live: z.boolean(),
});

export const customerDetailsSchema = z.object({
  name: z.string().min(1).max(80),
  phone: z.string().min(7).max(30),
  email: z.string().max(120),
  address: z.string().min(3).max(160),
  zip: z.string().regex(/^\d{5}$/),
});

const uiEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("slot_selected"),
    slotId: z.string().max(60),
    purpose: z.enum(["booking", "reschedule"]),
    bookingCode: z.string().max(20).nullable(),
    serviceCode: z.string().max(30),
  }),
  z.object({
    kind: z.literal("details_submitted"),
    slotId: z.string().max(60),
    serviceCode: z.string().max(30),
    details: customerDetailsSchema,
  }),
  z.object({ kind: z.literal("payment_confirmed"), bookingCode: z.string().max(20) }),
  z.object({ kind: z.literal("callback_requested"), phone: z.string().min(7).max(30) }),
  z.object({ kind: z.literal("handback") }),
]);

const wireImageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sample"), sampleId: z.string().max(40) }),
  z.object({
    kind: z.literal("upload"),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    // ~900 KB decoded; the exact size is checked again on the server.
    dataBase64: z.string().max(1_250_000),
  }),
  z.object({ kind: z.literal("gone") }),
]);

const wireToolSchema = z.object({
  id: z.string().max(80),
  name: z.string().max(60),
  input: z.unknown(),
  output: z.unknown(),
  isError: z.boolean(),
});

// Message text is deliberately not length-limited here: the route enforces the
// per-message cap itself so it can answer with a friendly notice instead of a
// validation error. The overall body size is still bounded.
export const wireMessageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"),
    text: z.string().max(100_000),
    sentAt: z.string().max(40),
    image: wireImageSchema.nullable(),
  }),
  z.object({ role: z.literal("assistant"), text: z.string().max(20_000), tools: z.array(wireToolSchema).max(12) }),
  z.object({ role: z.literal("staff"), text: z.string().max(2000), name: z.string().max(40) }),
  z.object({ role: z.literal("event"), sentAt: z.string().max(40), event: uiEventSchema }),
]);

export const sandboxSchema = z.object({
  jobs: z.array(jobSchema).max(200),
  lead: leadSchema,
});

export const chatRequestSchema = z.object({
  messages: z.array(wireMessageSchema).min(1).max(140),
  state: sandboxSchema,
  clock: clockSchema,
});

export const payRequestSchema = z.object({
  bookingCode: z.string().regex(/^CPL-\d{4,6}$/),
  card: z.object({
    name: z.string().max(80),
    number: z.string().max(30),
    expiry: z.string().max(10),
    cvc: z.string().max(6),
  }),
  state: sandboxSchema,
  clock: clockSchema,
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type PayRequest = z.infer<typeof payRequestSchema>;
