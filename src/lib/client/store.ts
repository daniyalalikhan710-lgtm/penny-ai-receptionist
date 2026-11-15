"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  emptyTurn,
  foldEvent,
  toWire,
  type AssistantTurn,
  type ChatImage,
  type ChatMessage,
  type UploadData,
} from "@/lib/domain/chat";
import { applyPatches } from "@/lib/domain/patches";
import { LIVE_LEAD_ID, freshLiveLead, seedAlerts, seedJobs, seedLeads, seedOutbox } from "@/lib/domain/seed";
import { OWNER } from "@/lib/domain/technicians";
import { clockFromDate, fmtStamp } from "@/lib/domain/time";
import type {
  Alert,
  Clock,
  DayStr,
  Job,
  Lead,
  OutboundMessage,
  Patch,
  StreamEvent,
  UiEvent,
} from "@/lib/domain/types";

/**
 * The visitor's whole sandbox: the business (jobs, leads, outbox, alerts) and
 * the chat. It lives in this browser only, persisted to localStorage, and is
 * wiped by "Reset demo". Each visitor gets an isolated copy; there is no DB.
 */

export type ViewMode = "split" | "customer" | "owner";

/** Per-card UI progress, keyed by the tool call that produced the card. */
export interface CardUiState {
  chosenSlotId?: string;
  submitted?: boolean;
  paid?: boolean;
  callbackSent?: boolean;
}

export interface Flight {
  id: string;
  jobCode: string;
  from: { x: number; y: number; w: number; h: number };
}

export interface CardPayment {
  name: string;
  number: string;
  expiry: string;
  cvc: string;
}

interface DemoData {
  seedDay: DayStr;
  jobs: Job[];
  leads: Lead[];
  lead: Lead;
  outbox: OutboundMessage[];
  alerts: Alert[];
  messages: ChatMessage[];
  cardState: Record<string, CardUiState>;
  /** First-response times measured in this session, for the median KPI. */
  responseMs: number[];
  view: ViewMode;
  xray: boolean;
  chatOpen: boolean;
}

interface DemoRuntime {
  ready: boolean;
  sending: boolean;
  mode: "live" | "replay" | null;
  model: string | null;
  uploads: Record<string, UploadData>;
  flights: Flight[];
  /** Job codes that just landed on the board, for the arrival highlight. */
  justLanded: string[];
  selectedLeadId: string | null;
  boardDay: DayStr | null;
  citation: { docId: string; start: number; end: number; quote: string } | null;
}

interface DemoActions {
  hydrate: () => void;
  reset: () => void;
  setView: (view: ViewMode) => void;
  setXray: (on: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setStatus: (mode: "live" | "replay", model: string | null) => void;
  sendUser: (text: string, image?: ChatImage | null, upload?: { id: string; data: UploadData }) => Promise<void>;
  sendEvent: (event: UiEvent) => Promise<void>;
  setCardState: (toolId: string, changes: CardUiState) => void;
  pay: (toolId: string, bookingCode: string, card: CardPayment, from: Flight["from"] | null) => Promise<{ ok: boolean; reason?: string }>;
  clearFlight: (id: string) => void;
  clearLanded: (code: string) => void;
  selectLead: (id: string | null) => void;
  setBoardDay: (day: DayStr | null) => void;
  takeOver: (leadId: string) => void;
  handBack: (leadId: string) => void;
  staffReply: (leadId: string, text: string) => void;
  acknowledgeAlert: (id: string) => void;
  openCitation: (citation: DemoRuntime["citation"]) => void;
}

export type DemoStore = DemoData & DemoRuntime & DemoActions;

const STORAGE_KEY = "penny-demo-v1";

const NO_STORAGE = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

/**
 * localStorage, written at most a few times a second. A streamed reply updates
 * the store on every token; serialising the whole sandbox that often would
 * make the chat stutter. Pending writes are flushed when the tab is hidden.
 */
function createThrottledStorage() {
  let pending: { key: string; value: string } | null = null;
  let timer: number | null = null;
  const flush = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (!pending) return;
    try {
      window.localStorage.setItem(pending.key, pending.value);
    } catch {
      // Storage full or blocked: the demo still works, it just won't persist.
    }
    pending = null;
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  return {
    getItem: (key: string) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string) => {
      pending = { key, value };
      if (timer === null) timer = window.setTimeout(flush, 300);
    },
    removeItem: (key: string) => {
      pending = null;
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

function now(): Clock {
  return clockFromDate(new Date());
}

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function freshData(clock: Clock, keep?: Pick<DemoData, "view" | "xray">): DemoData {
  return {
    seedDay: clock.today,
    jobs: seedJobs(clock),
    leads: seedLeads(clock.today),
    lead: freshLiveLead(clock),
    outbox: seedOutbox(clock.today),
    alerts: seedAlerts(),
    messages: [],
    cardState: {},
    responseMs: [],
    view: keep?.view ?? "split",
    xray: keep?.xray ?? false,
    chatOpen: true,
  };
}

const PLACEHOLDER_CLOCK: Clock = { today: "2000-01-01", nowMinutes: 0, tz: "UTC" };

const initialRuntime: DemoRuntime = {
  ready: false,
  sending: false,
  mode: null,
  model: null,
  uploads: {},
  flights: [],
  justLanded: [],
  selectedLeadId: null,
  boardDay: null,
  citation: null,
};

async function* readNdjson(response: Response): AsyncGenerator<StreamEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          yield JSON.parse(line) as StreamEvent;
        } catch {
          // A malformed line is skipped rather than breaking the whole turn.
        }
      }
      newline = buffer.indexOf("\n");
    }
  }
  const rest = buffer.trim();
  if (rest) {
    try {
      yield JSON.parse(rest) as StreamEvent;
    } catch {
      // ignore
    }
  }
}

export const useDemo = create<DemoStore>()(
  persist(
    (set, get) => {
      const applyAll = (patches: Patch[]) => {
        if (patches.length === 0) return;
        const s = get();
        const next = applyPatches({ jobs: s.jobs, lead: s.lead, outbox: s.outbox, alerts: s.alerts }, patches);
        set({ jobs: next.jobs, lead: next.lead, outbox: next.outbox, alerts: next.alerts });
      };

      const updateAssistant = (id: string, turn: AssistantTurn, extra: Partial<Extract<ChatMessage, { role: "assistant" }>> = {}) => {
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id && m.role === "assistant" ? { ...m, turn, ...extra } : m)),
        }));
      };

      const runTurn = async () => {
        const clock = now();
        const assistantId = uid("a");
        const startedAt = performance.now();
        const before = get();
        const wire = toWire(before.messages, before.uploads);
        set((s) => ({
          sending: true,
          messages: [...s.messages, { id: assistantId, role: "assistant", turn: emptyTurn(), atMin: clock.nowMinutes, streaming: true, responseMs: null }],
        }));

        let turn = emptyTurn();
        let firstMs: number | null = null;
        const failWith = (message: string) => {
          turn = { ...turn, notices: [...turn.notices, { code: "error", message }] };
        };

        try {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: wire, state: { jobs: before.jobs, lead: before.lead }, clock }),
          });
          const type = response.headers.get("content-type") ?? "";
          if (!type.includes("ndjson")) {
            let reason = "Something went wrong. Please try again.";
            try {
              const body = (await response.json()) as { error?: string };
              if (body.error) reason = body.error;
            } catch {
              // keep the generic message
            }
            failWith(reason);
          } else {
            for await (const event of readNdjson(response)) {
              if (firstMs === null && (event.type === "text" || event.type === "tool_call" || event.type === "notice")) {
                firstMs = Math.round(performance.now() - startedAt);
              }
              const folded = foldEvent(turn, event);
              turn = folded.turn;
              applyAll(folded.patches);
              if (event.type === "meta") set({ mode: event.mode, model: event.model });
              updateAssistant(assistantId, turn);
            }
            if (turn.stopReason === null) failWith("The connection dropped before Penny finished. Please try again.");
          }
        } catch {
          failWith("Couldn't reach the server. Check your connection and try again.");
        }

        updateAssistant(assistantId, turn, { streaming: false, responseMs: firstMs });
        set((s) => ({
          sending: false,
          responseMs: firstMs !== null && turn.stopReason !== "rejected" ? [...s.responseMs, firstMs].slice(-40) : s.responseMs,
        }));
      };

      return {
        // A fixed placeholder until hydrate() runs in the browser, so nothing
        // time-dependent is evaluated while the page is prerendered.
        ...freshData(PLACEHOLDER_CLOCK),
        ...initialRuntime,

        hydrate: () => {
          if (get().ready) return;
          void Promise.resolve(useDemo.persist.rehydrate()).then(() => {
            const clock = now();
            const s = get();
            // A sandbox seeded on an earlier day would show a stale calendar.
            if (s.seedDay !== clock.today) set({ ...freshData(clock, { view: s.view, xray: s.xray }) });
            // A turn that was mid-stream when the tab closed cannot resume.
            set((cur) => ({
              ready: true,
              messages: cur.messages.map((m) => (m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m)),
            }));
          });
        },

        reset: () => {
          const s = get();
          set({ ...freshData(now(), { view: s.view, xray: s.xray }), ...initialRuntime, ready: true, mode: s.mode, model: s.model });
        },

        setView: (view) => set({ view }),
        setXray: (xray) => set({ xray }),
        setChatOpen: (chatOpen) => set({ chatOpen }),
        setStatus: (mode, model) => set({ mode, model }),

        sendUser: async (text, image = null, upload) => {
          const s = get();
          if (s.sending) return;
          const clock = now();
          const first = !s.messages.some((m) => m.role === "user");
          set((cur) => ({
            uploads: upload ? { ...cur.uploads, [upload.id]: upload.data } : cur.uploads,
            lead: first ? { ...cur.lead, startedDay: clock.today, startedAtMin: clock.nowMinutes } : cur.lead,
            messages: [...cur.messages, { id: uid("u"), role: "user", text, sentAt: fmtStamp(clock), atMin: clock.nowMinutes, image }],
          }));
          // While a person has taken over, Penny stays quiet: the owner replies.
          if (get().lead.status === "human") return;
          await runTurn();
        },

        sendEvent: async (event) => {
          if (get().sending) return;
          const clock = now();
          set((cur) => ({
            messages: [...cur.messages, { id: uid("e"), role: "event", event, sentAt: fmtStamp(clock), atMin: clock.nowMinutes }],
          }));
          await runTurn();
        },

        setCardState: (toolId, changes) =>
          set((s) => ({ cardState: { ...s.cardState, [toolId]: { ...s.cardState[toolId], ...changes } } })),

        pay: async (toolId, bookingCode, card, from) => {
          const s = get();
          try {
            const response = await fetch("/api/pay", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bookingCode, card, state: { jobs: s.jobs, lead: s.lead }, clock: now() }),
            });
            const body = (await response.json()) as { ok: boolean; reason?: string; patches?: Patch[] };
            if (!body.ok || !body.patches) return { ok: false, reason: body.reason ?? "The payment didn't go through. Please try again." };
            applyAll(body.patches);
            set((cur) => ({
              cardState: { ...cur.cardState, [toolId]: { ...cur.cardState[toolId], paid: true } },
              flights: from ? [...cur.flights, { id: uid("f"), jobCode: bookingCode, from }] : cur.flights,
              justLanded: from ? cur.justLanded : [...cur.justLanded, bookingCode],
            }));
            void get().sendEvent({ kind: "payment_confirmed", bookingCode });
            return { ok: true };
          } catch {
            return { ok: false, reason: "Couldn't reach the server. Check your connection and try again." };
          }
        },

        clearFlight: (id) =>
          set((s) => {
            const flight = s.flights.find((f) => f.id === id);
            return {
              flights: s.flights.filter((f) => f.id !== id),
              justLanded: flight ? [...s.justLanded, flight.jobCode] : s.justLanded,
            };
          }),
        clearLanded: (code) => set((s) => ({ justLanded: s.justLanded.filter((c) => c !== code) })),

        selectLead: (selectedLeadId) => set({ selectedLeadId }),
        setBoardDay: (boardDay) => set({ boardDay }),

        takeOver: (leadId) => {
          const clock = now();
          if (leadId === LIVE_LEAD_ID) {
            set((s) => ({
              lead: { ...s.lead, status: "human" },
              messages: [...s.messages, { id: uid("s"), role: "system", tone: "join", text: `${OWNER.name} from Copperline joined the chat`, atMin: clock.nowMinutes }],
            }));
          } else {
            set((s) => ({ leads: s.leads.map((l) => (l.id === leadId ? { ...l, status: "human" } : l)) }));
          }
        },

        handBack: (leadId) => {
          const clock = now();
          if (leadId === LIVE_LEAD_ID) {
            const s = get();
            if (s.lead.status !== "human") return;
            const hadEmergency = s.lead.emergency;
            set((cur) => ({
              lead: { ...cur.lead, status: hadEmergency ? "needs_human" : cur.lead.jobCode ? "booked" : "penny" },
              messages: [...cur.messages, { id: uid("s"), role: "system", tone: "join", text: `${OWNER.name} left the chat. Penny is back.`, atMin: clock.nowMinutes }],
            }));
            // Only wake Penny if the customer has actually said something.
            if (get().messages.some((m) => m.role === "user")) void get().sendEvent({ kind: "handback" });
          } else {
            set((s) => ({ leads: s.leads.map((l) => (l.id === leadId ? { ...l, status: l.jobCode ? "booked" : "resolved" } : l)) }));
          }
        },

        staffReply: (leadId, text) => {
          const clean = text.trim().slice(0, 1000);
          if (!clean) return;
          const clock = now();
          if (leadId === LIVE_LEAD_ID) {
            set((s) => ({
              messages: [...s.messages, { id: uid("st"), role: "staff", text: clean, name: OWNER.name, atMin: clock.nowMinutes }],
            }));
          } else {
            set((s) => ({
              leads: s.leads.map((l) => (l.id === leadId ? { ...l, transcript: [...l.transcript, { from: "staff", text: clean }] } : l)),
            }));
          }
        },

        acknowledgeAlert: (id) => set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) })),

        openCitation: (citation) => set({ citation }),
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      // On the server there is no browser storage; a no-op keeps prerendering quiet.
      storage: createJSONStorage(() => (typeof window === "undefined" ? NO_STORAGE : createThrottledStorage())),
      skipHydration: true,
      partialize: (s): DemoData => ({
        seedDay: s.seedDay,
        jobs: s.jobs,
        leads: s.leads,
        lead: s.lead,
        outbox: s.outbox,
        alerts: s.alerts,
        messages: s.messages,
        cardState: s.cardState,
        responseMs: s.responseMs,
        view: s.view,
        xray: s.xray,
        chatOpen: s.chatOpen,
      }),
    },
  ),
);

export { LIVE_LEAD_ID };
