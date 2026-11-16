/**
 * Shared domain types. Everything here is plain data that can cross the
 * client/server boundary. No prices live in this file: the price book is
 * server-only (see src/lib/server/pricebook.ts).
 */

export type Urgency = "routine" | "soon" | "urgent" | "emergency";
export type Trade = "plumbing" | "hvac";
export type Lang = "en" | "es";

/** A calendar day in the visitor's local timezone, formatted YYYY-MM-DD. */
export type DayStr = string;

export interface Clock {
  /** Visitor-local calendar day. */
  today: DayStr;
  /** Minutes since local midnight. */
  nowMinutes: number;
  /** IANA timezone name, informational only. */
  tz: string;
}

export interface Technician {
  id: string;
  name: string;
  initials: string;
  title: string;
  trades: Trade[];
  /** Tailwind-safe hex used for the avatar ring. */
  color: string;
}

export type JobStatus = "pending_payment" | "confirmed" | "cancelled";
export type JobSource = "penny" | "phone" | "web";

export type PhotoRef =
  | { kind: "sample"; sampleId: string }
  /** The thumbnail lives only in the visitor's browser. */
  | { kind: "upload" };

export interface Job {
  id: string;
  code: string;
  techId: string;
  date: DayStr;
  startMin: number;
  durationMin: number;
  serviceCode: string;
  serviceName: string;
  customerName: string;
  address: string;
  phone: string;
  email: string;
  urgency: Urgency;
  status: JobStatus;
  source: JobSource;
  /** One-line English summary written by Penny (or the dispatcher). */
  summary: string;
  photo: PhotoRef | null;
  /** Estimate range quoted from the price book at booking time. */
  estLow: number;
  estHigh: number;
  feeDue: number;
  feePaid: boolean;
  /** Local day the booking was made, used for "booked today" metrics. */
  createdDay: DayStr;
  createdAtMin: number;
  conversationId: string | null;
}

export type LeadStatus = "penny" | "needs_human" | "human" | "booked" | "resolved";
export type LeadIntent =
  | "booking"
  | "question"
  | "pricing"
  | "emergency"
  | "reschedule"
  | "cancel"
  | "other";

export interface TranscriptLine {
  from: "customer" | "penny" | "staff";
  text: string;
}

export interface Lead {
  id: string;
  customerName: string;
  channel: "Website chat" | "SMS";
  startedDay: DayStr;
  startedAtMin: number;
  /** Always English, even when the customer wrote in another language. */
  summary: string;
  intent: LeadIntent;
  urgency: Urgency;
  status: LeadStatus;
  language: Lang;
  emergency: boolean;
  jobCode: string | null;
  callbackPhone: string | null;
  /** Seeded leads carry a short transcript; the live lead reads the real chat. */
  transcript: TranscriptLine[];
  live: boolean;
}

export interface OutboundMessage {
  id: string;
  channel: "sms" | "email";
  to: string;
  subject: string | null;
  body: string;
  day: DayStr;
  atMin: number;
  jobCode: string | null;
}

export interface Alert {
  id: string;
  kind: "emergency";
  emergencyKind: EmergencyKind;
  leadId: string;
  headline: string;
  detail: string;
  day: DayStr;
  atMin: number;
  callbackPhone: string | null;
  acknowledged: boolean;
}

export type EmergencyKind = "gas" | "co" | "flood" | "electrical" | "other";

/** The slice of the sandbox that the server tools read and write. */
export interface SandboxState {
  jobs: Job[];
  lead: Lead;
}

/* ------------------------------------------------------------------ */
/* State patches: tools return these, the client applies them.         */
/* ------------------------------------------------------------------ */

export type Patch =
  | { op: "job.add"; job: Job }
  | { op: "job.update"; code: string; changes: Partial<Omit<Job, "id" | "code">> }
  | { op: "lead.update"; changes: Partial<Omit<Lead, "id" | "live" | "transcript">> }
  | { op: "message.log"; message: OutboundMessage }
  | { op: "alert.raise"; alert: Alert }
  | { op: "alert.update"; leadId: string; changes: Partial<Pick<Alert, "callbackPhone" | "detail">> };

/* ------------------------------------------------------------------ */
/* Cards: structured tool results rendered as rich UI in the chat.     */
/* ------------------------------------------------------------------ */

export interface SlotOption {
  id: string;
  techId: string;
  techName: string;
  date: DayStr;
  startMin: number;
  durationMin: number;
}

export interface EstimateView {
  serviceCode: string;
  serviceName: string;
  low: number;
  high: number;
  diagnosticFee: number;
  afterHoursSurcharge: number;
  memberApplied: boolean;
  afterHoursApplied: boolean;
  note: string;
}

export interface CustomerDetails {
  name: string;
  phone: string;
  email: string;
  address: string;
  zip: string;
}

export interface BookingView {
  code: string;
  serviceName: string;
  techName: string;
  techId: string;
  date: DayStr;
  startMin: number;
  durationMin: number;
  address: string;
  customerName: string;
  status: JobStatus;
  feePaid: boolean;
  feeDue: number;
}

export type Card =
  | {
      kind: "diagnosis";
      homeRepair: true;
      issue: string;
      whatISee: string;
      confidence: "low" | "medium" | "high";
      severity: Urgency;
      steps: string[];
      estimate: EstimateView | null;
    }
  | { kind: "diagnosis"; homeRepair: false }
  | { kind: "estimate"; estimate: EstimateView }
  | {
      kind: "slots";
      serviceCode: string;
      serviceName: string;
      slots: SlotOption[];
      purpose: "booking" | "reschedule";
      bookingCode: string | null;
    }
  | {
      kind: "details";
      slot: SlotOption;
      serviceCode: string;
      serviceName: string;
      prefill: CustomerDetails;
    }
  | { kind: "checkout"; booking: BookingView; estimate: EstimateView }
  | {
      kind: "confirmation";
      variant: "booked" | "rescheduled";
      booking: BookingView;
      smsPreview: string;
      smsTo: string;
      emailTo: string;
    }
  | { kind: "booking"; booking: BookingView }
  | { kind: "cancelled"; booking: BookingView; refundNote: string }
  | {
      kind: "emergency";
      emergencyKind: EmergencyKind;
      headline: string;
      steps: string[];
      doNot: string[];
      callLine: string;
    }
  | { kind: "handoff"; phone: string; etaText: string; reason: string; priority: "emergency" | "standard" }
  | { kind: "service_area"; zip: string; inArea: boolean; town: string | null; nearby: string[] };

/* ------------------------------------------------------------------ */
/* Wire transcript: what the client sends to /api/chat each turn.      */
/* ------------------------------------------------------------------ */

export type WireImage =
  | { kind: "sample"; sampleId: string }
  | { kind: "upload"; mediaType: "image/jpeg" | "image/png" | "image/webp"; dataBase64: string }
  /** The upload is no longer in the browser's memory (page was reloaded). */
  | { kind: "gone" };

export type UiEvent =
  | { kind: "slot_selected"; slotId: string; purpose: "booking" | "reschedule"; bookingCode: string | null; serviceCode: string }
  | { kind: "details_submitted"; slotId: string; serviceCode: string; details: CustomerDetails }
  | { kind: "payment_confirmed"; bookingCode: string }
  | { kind: "callback_requested"; phone: string }
  | { kind: "handback" };

export interface WireToolRecord {
  id: string;
  name: string;
  input: unknown;
  output: unknown;
  isError: boolean;
}

export type WireMessage =
  | { role: "user"; text: string; sentAt: string; image: WireImage | null }
  | { role: "assistant"; text: string; tools: WireToolRecord[] }
  | { role: "staff"; text: string; name: string }
  | { role: "event"; sentAt: string; event: UiEvent };

/* ------------------------------------------------------------------ */
/* Stream events: what /api/chat sends back, one JSON object per line. */
/* ------------------------------------------------------------------ */

export interface CitationView {
  docId: string;
  docTitle: string;
  quote: string;
  start: number;
  end: number;
  /** True when the server matched the passage itself because the model left its citation off. */
  matched?: boolean;
}

export interface UsageView {
  step: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** null when the model has no entry in the price table. */
  costUsd: number | null;
  ms: number;
}

export type NoticeCode =
  | "rate_limited"
  | "message_cap"
  | "image_cap"
  | "too_long"
  | "upload_invalid"
  | "refusal"
  | "error"
  | "off_script"
  | "budget_fallback";

export type StreamEvent =
  | { type: "meta"; mode: "live" | "replay"; model: string | null }
  | { type: "text"; text: string }
  | { type: "citation"; citation: CitationView; /** Characters back from the end of the text so far; 0 or absent means "here". */ back?: number }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      id: string;
      name: string;
      output: unknown;
      card: Card | null;
      patches: Patch[];
      isError: boolean;
      ms: number;
    }
  | { type: "usage"; usage: UsageView }
  | { type: "notice"; code: NoticeCode; message: string }
  | { type: "done"; stopReason: string; totalMs: number };
