"use client";

import {
  ArrowLeft,
  BellRing,
  CalendarCheck,
  CircleDollarSign,
  Languages,
  Mail,
  MessageSquareText,
  PhoneCall,
  SendHorizontal,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Timer,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useClock, useReducedMotion } from "@/lib/client/hooks";
import { URGENCY_CLASS, urgencyLabel } from "@/lib/client/i18n";
import { useDemo } from "@/lib/client/store";
import { turnText, type ChatMessage } from "@/lib/domain/chat";
import { BASELINE } from "@/lib/domain/seed";
import { OWNER } from "@/lib/domain/technicians";
import { fmtDayLong, fmtMoney, fmtTime } from "@/lib/domain/time";
import type { Card, Lead, LeadStatus, TranscriptLine } from "@/lib/domain/types";
import { DispatchBoard } from "./dispatch-board";

/* ---------------------------------- KPIs ---------------------------------- */

function useCountUp(target: number): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(start + (target - start) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = target;
    };
  }, [target, reduced]);
  return value;
}

function Kpi({
  icon,
  label,
  value,
  format,
  hint,
  testId,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  format: (n: number) => string;
  hint: string;
  testId: string;
  accent?: boolean;
}) {
  const shown = useCountUp(value);
  const [bump, setBump] = useState(false);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setBump(true);
    const timer = window.setTimeout(() => setBump(false), 1400);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border bg-white px-3 py-2.5 transition-colors duration-700",
        bump ? "border-copper-400 bg-copper-50" : "border-ink-100",
      )}
    >
      <p className="flex items-center gap-1.5 text-[11px] leading-tight font-medium text-ink-600">
        <span className={cn("shrink-0", accent ? "text-copper-600" : "text-ink-400")} aria-hidden>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </p>
      {/* The animated number is decorative; assistive tech reads the final value. */}
      <p className="mt-1 font-display text-[24px] leading-none font-semibold text-ink-900 tabular-nums" data-testid={testId} data-value={value}>
        <span aria-hidden>{format(shown)}</span>
        <span className="sr-only">{format(value)}</span>
      </p>
      <p className="mt-1 truncate text-[10.5px] text-ink-500">{hint}</p>
    </div>
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function KpiStrip({ today }: { today: string }) {
  const jobs = useDemo((s) => s.jobs);
  const leads = useDemo((s) => s.leads);
  const lead = useDemo((s) => s.lead);
  const started = useDemo((s) => s.messages.some((m) => m.role === "user"));
  const responseMs = useDemo((s) => s.responseMs);

  const pennyJobs = jobs.filter((j) => j.source === "penny" && j.createdDay === today && j.status === "confirmed");
  const revenue = pennyJobs.reduce((sum, j) => sum + (j.estLow + j.estHigh) / 2, 0);
  const escalations = leads.filter((l) => l.status === "needs_human" || l.status === "human").length + (lead.status === "needs_human" || lead.status === "human" ? 1 : 0);
  const medianMs = median([...BASELINE.responseMs, ...responseMs]);

  return (
    <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3 @3xl:grid-cols-5">
      <Kpi icon={<CalendarCheck className="size-3.5" />} label="Booked by Penny today" value={pennyJobs.length} format={(n) => String(Math.round(n))} hint="No staff time used" testId="kpi-booked" accent />
      <Kpi icon={<CircleDollarSign className="size-3.5" />} label="Revenue booked today" value={Math.round(revenue)} format={(n) => fmtMoney(Math.round(n))} hint="Estimate midpoints" testId="kpi-revenue" accent />
      <Kpi icon={<MessageSquareText className="size-3.5" />} label="Conversations today" value={BASELINE.conversations + (started ? 1 : 0)} format={(n) => String(Math.round(n))} hint="Chat and SMS, today" testId="kpi-conversations" />
      <Kpi icon={<Timer className="size-3.5" />} label="Median response time" value={Math.round(medianMs)} format={(n) => `${(n / 1000).toFixed(1)}s`} hint="To Penny's first reply" testId="kpi-response" />
      <Kpi icon={<UsersRound className="size-3.5" />} label="Escalated to staff" value={escalations} format={(n) => String(Math.round(n))} hint="Waiting on the team" testId="kpi-escalations" />
    </div>
  );
}

/* --------------------------------- Alerts --------------------------------- */

function AlertBanner() {
  const alerts = useDemo((s) => s.alerts);
  const acknowledge = useDemo((s) => s.acknowledgeAlert);
  const selectLead = useDemo((s) => s.selectLead);
  const active = alerts.filter((a) => !a.acknowledged);
  if (active.length === 0) return null;
  return (
    <div className="space-y-2">
      {active.map((alert) => (
        <div
          key={alert.id}
          role="alert"
          data-testid="emergency-alert"
          className="on-dark flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-red-700 px-3.5 py-2.5 text-white shadow-lg motion-safe:animate-alert"
        >
          <ShieldAlert className="size-6 shrink-0" aria-hidden />
          {/* A minimum width makes the buttons wrap below the text on phones
              instead of squeezing the text into a one-word column. */}
          <div className="min-w-[13rem] flex-1">
            <p className="text-[14px] leading-tight font-bold">
              EMERGENCY · {alert.headline} <span className="font-medium text-red-100">· {fmtTime(alert.atMin)}</span>
            </p>
            <p className="text-[12.5px] leading-snug text-red-50">{alert.detail} Penny has given safety instructions.</p>
            {alert.callbackPhone ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold" data-testid="alert-callback">
                <PhoneCall className="size-3.5" aria-hidden /> Callback requested: {alert.callbackPhone}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => selectLead(alert.leadId)} className="h-8 rounded-lg bg-white px-3 text-[12.5px] font-semibold text-red-800 hover:bg-red-50">
              Open conversation
            </button>
            <button type="button" onClick={() => acknowledge(alert.id)} className="h-8 rounded-lg px-3 text-[12.5px] font-semibold text-white ring-1 ring-white/60 hover:bg-white/10">
              Acknowledge
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- Inbox --------------------------------- */

const STATUS_STYLE: Record<LeadStatus, { label: string; className: string }> = {
  penny: { label: "Penny handling", className: "bg-copper-100 text-copper-900" },
  needs_human: { label: "Needs human", className: "bg-red-100 text-red-900" },
  human: { label: `${OWNER.name} in chat`, className: "bg-ink-900 text-cream" },
  booked: { label: "Booked", className: "bg-emerald-100 text-emerald-900" },
  resolved: { label: "Resolved", className: "bg-ink-100 text-ink-700" },
};

const CARD_LABEL: Record<Card["kind"], string> = {
  diagnosis: "photo diagnosis",
  estimate: "estimate",
  slots: "available times",
  details: "details form",
  checkout: "checkout",
  confirmation: "booking confirmation",
  booking: "booking details",
  cancelled: "cancellation",
  emergency: "emergency safety steps",
  handoff: "callback confirmation",
  service_area: "service-area check",
};

/** The live conversation as the owner sees it, built from the real chat. */
interface ShownLine extends TranscriptLine {
  /** Cards Penny showed the customer in this turn. */
  shown?: string[];
}

function liveTranscript(messages: ChatMessage[]): ShownLine[] {
  const lines: ShownLine[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      lines.push({ from: "customer", text: m.text, shown: m.image ? ["__photo"] : [] });
    } else if (m.role === "staff") {
      lines.push({ from: "staff", text: m.text });
    } else if (m.role === "assistant") {
      const text = turnText(m.turn);
      const cards = m.turn.parts.flatMap((p) => (p.type === "tool" && p.card ? [CARD_LABEL[p.card.kind]] : []));
      if (text || cards.length) lines.push({ from: "penny", text, shown: cards });
    }
  }
  return lines;
}

function LeadRow({ lead, selected, onSelect }: { lead: Lead; selected: boolean; onSelect: () => void }) {
  const status = STATUS_STYLE[lead.status];
  return (
    <li>
      <button
        type="button"
        data-testid={`lead-${lead.id}`}
        data-status={lead.status}
        onClick={onSelect}
        aria-current={selected}
        className={cn(
          "flex w-full flex-col gap-1 border-l-4 px-3 py-2.5 text-left transition hover:bg-ink-50",
          lead.emergency ? "border-l-urg-emergency bg-red-50/60" : URGENCY_CLASS[lead.urgency].bar,
          selected && "bg-ink-50",
        )}
      >
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">
            {lead.customerName}
            {lead.live ? <span className="ml-1.5 rounded bg-emerald-100 px-1 py-px align-middle text-[9px] font-bold tracking-wide text-emerald-900 uppercase">Live</span> : null}
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", status.className)}>{status.label}</span>
        </span>
        <span className="line-clamp-2 text-[12px] leading-snug text-ink-700" data-testid="lead-summary">
          {lead.summary || "Conversation just started. Penny will summarise it here."}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-ink-500">
          <span>{lead.channel}</span>
          <span aria-hidden>·</span>
          <span>{fmtTime(lead.startedAtMin)}</span>
          <span aria-hidden>·</span>
          <span className="capitalize">{lead.intent}</span>
          <span aria-hidden>·</span>
          <span className={cn("rounded-full px-1.5 py-px font-semibold ring-1 ring-inset", URGENCY_CLASS[lead.urgency].chip)}>{urgencyLabel(lead.urgency)}</span>
          {lead.language !== "en" ? (
            <span className="flex items-center gap-0.5 rounded-full bg-ink-100 px-1.5 py-px font-semibold text-ink-700" title="Customer wrote in Spanish; summary is in English">
              <Languages className="size-3" aria-hidden /> ES
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function LeadDetail({ lead, onBack }: { lead: Lead; onBack: () => void }) {
  const messages = useDemo((s) => s.messages);
  const takeOver = useDemo((s) => s.takeOver);
  const handBack = useDemo((s) => s.handBack);
  const staffReply = useDemo((s) => s.staffReply);
  const sending = useDemo((s) => s.sending);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const transcript: ShownLine[] = useMemo(() => (lead.live ? liveTranscript(messages) : lead.transcript), [lead, messages]);
  const inChat = lead.status === "human";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    staffReply(lead.id, draft);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="lead-detail">
      <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2">
        <button type="button" onClick={onBack} aria-label="Back to inbox" className="flex size-7 items-center justify-center rounded-md text-ink-600 hover:bg-ink-100">
          <ArrowLeft className="size-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink-900">{lead.customerName}</p>
          <p className="truncate text-[10.5px] text-ink-500">
            {lead.channel} · {STATUS_STYLE[lead.status].label}
            {lead.callbackPhone ? ` · Callback ${lead.callbackPhone}` : ""}
          </p>
        </div>
        {inChat ? (
          <button
            type="button"
            data-testid="hand-back"
            onClick={() => handBack(lead.id)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
          >
            <Sparkles className="size-3.5 text-copper-600" aria-hidden /> Hand back to Penny
          </button>
        ) : (
          <button
            type="button"
            data-testid="take-over"
            disabled={lead.live && sending}
            onClick={() => takeOver(lead.id)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-ink-900 px-2.5 text-[12px] font-semibold text-cream hover:bg-ink-700 disabled:opacity-50"
          >
            <UserRoundCheck className="size-3.5" aria-hidden /> Take over
          </button>
        )}
      </div>
      {lead.summary ? (
        <p className="border-b border-ink-100 bg-copper-50 px-3 py-2 text-[12px] leading-snug text-ink-800">
          <span className="font-semibold text-copper-800">AI summary: </span>
          {lead.summary}
        </p>
      ) : null}
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5" tabIndex={0} aria-label="Conversation transcript">
        {transcript.length === 0 && <p className="py-6 text-center text-[12px] text-ink-500">No messages yet. Send one from the customer view.</p>}
        {transcript.map((line, i) => (
          <div key={i} className={cn("flex", line.from === "customer" ? "justify-start" : "justify-end")}>
            <div
              className={cn(
                "max-w-[88%] rounded-xl px-2.5 py-1.5 text-[12.5px] leading-snug whitespace-pre-wrap",
                line.from === "customer" && "bg-ink-100 text-ink-900",
                line.from === "penny" && "bg-copper-50 text-ink-900 ring-1 ring-copper-200",
                line.from === "staff" && "bg-ink-900 text-cream",
              )}
            >
              <span className={cn("mb-0.5 block text-[9.5px] font-bold tracking-wide uppercase", line.from === "staff" ? "text-copper-200" : "text-ink-500")}>
                {line.from === "customer" ? "Customer" : line.from === "penny" ? "Penny (AI)" : `${OWNER.name} (you)`}
              </span>
              {line.text}
              {line.shown && line.shown.length > 0 ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {line.shown.map((card, j) => (
                    <span key={j} className="rounded bg-white px-1.5 py-px text-[10px] font-medium text-copper-800 ring-1 ring-copper-200">
                      {card === "__photo" ? "Sent a photo" : `Showed ${card}`}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {inChat ? (
        <form onSubmit={submit} className="flex items-center gap-1.5 border-t border-ink-100 p-2">
          <label htmlFor="staff-reply" className="sr-only">
            Reply as {OWNER.name}
          </label>
          <input
            id="staff-reply"
            data-testid="staff-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            placeholder={`Reply as ${OWNER.name}…`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-ink-200 px-2.5 text-[13px]"
          />
          <button type="submit" data-testid="staff-send" disabled={!draft.trim()} aria-label="Send reply" className="flex size-9 items-center justify-center rounded-lg bg-ink-900 text-cream disabled:bg-ink-200 disabled:text-ink-400">
            <SendHorizontal className="size-4" aria-hidden />
          </button>
        </form>
      ) : (
        <p className="border-t border-ink-100 px-3 py-2 text-[11px] leading-snug text-ink-500">
          {lead.status === "penny"
            ? "Penny is handling this. Take over to reply yourself; Penny pauses until you hand back."
            : lead.status === "needs_human"
              ? "Penny has flagged this for a person. Take over to reply; Penny stays paused until you hand back."
              : "Take over to add a reply to this conversation."}
        </p>
      )}
    </div>
  );
}

function Inbox() {
  const leads = useDemo((s) => s.leads);
  const lead = useDemo((s) => s.lead);
  const started = useDemo((s) => s.messages.length > 0);
  const selectedId = useDemo((s) => s.selectedLeadId);
  const selectLead = useDemo((s) => s.selectLead);
  const all = useMemo(() => (started ? [lead, ...leads] : leads), [started, lead, leads]);
  const selected = all.find((l) => l.id === selectedId) ?? null;

  return (
    <section aria-labelledby="inbox-title" className="flex h-[460px] min-h-0 flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white">
      {selected ? (
        <LeadDetail lead={selected} onBack={() => selectLead(null)} />
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2.5">
            <h2 id="inbox-title" className="text-[13px] font-semibold text-ink-900">
              Leads &amp; conversations
            </h2>
            <span className="text-[11px] text-ink-500">
              Latest {all.length} of {BASELINE.conversations + (started ? 1 : 0)} today
            </span>
          </div>
          <ul className="scroll-thin min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto" data-testid="inbox-list">
            {all.map((l) => (
              <LeadRow key={l.id} lead={l} selected={false} onSelect={() => selectLead(l.id)} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* --------------------------------- Outbox --------------------------------- */

function Outbox() {
  const outbox = useDemo((s) => s.outbox);
  return (
    <section aria-labelledby="outbox-title" className="flex h-[460px] min-h-0 flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2.5">
        <h2 id="outbox-title" className="text-[13px] font-semibold text-ink-900">
          Messages sent
        </h2>
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600" title="No real SMS or email is sent in this demo">
          Simulated
        </span>
      </div>
      <ul className="scroll-thin min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto" data-testid="outbox-list" tabIndex={0} aria-labelledby="outbox-title">
        {outbox.map((message) => (
          <li key={message.id} className="animate-pop-in px-3 py-2.5" data-testid="outbox-item">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-500">
              {message.channel === "sms" ? <Smartphone className="size-3.5 text-ink-400" aria-hidden /> : <Mail className="size-3.5 text-ink-400" aria-hidden />}
              <span className="font-semibold text-ink-800">{message.channel === "sms" ? "SMS" : "Email"}</span>
              <span className="min-w-0 flex-1 truncate">to {message.to}</span>
              <span className="shrink-0 tabular-nums">{fmtTime(message.atMin)}</span>
            </p>
            {message.subject ? <p className="mt-1 text-[12px] font-semibold text-ink-900">{message.subject}</p> : null}
            <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-ink-700">{message.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------- Dashboard ------------------------------- */

export function Dashboard() {
  const clock = useClock();
  const hasAlert = useDemo((s) => s.alerts.some((a) => !a.acknowledged));
  return (
    <div className="@container flex h-full min-h-0 flex-col bg-ink-50" data-testid="dashboard">
      <header className="on-dark flex shrink-0 items-center gap-3 bg-ink-900 px-4 py-2.5 text-cream">
        <span className="flex size-8 items-center justify-center rounded-lg bg-copper-500 font-display text-[15px] font-bold text-ink-950" aria-hidden>
          C
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[14px] leading-tight font-semibold">Copperline Ops</h1>
          <p className="truncate text-[11.5px] text-ink-300">{clock.today === "2000-01-01" ? " " : `${fmtDayLong(clock.today)} · ${fmtTime(clock.nowMinutes)}`}</p>
        </div>
        {hasAlert ? <BellRing className="size-5 text-red-300 motion-safe:animate-pulse" aria-hidden /> : null}
        <span className="hidden items-center gap-2 text-[12px] text-ink-200 @md:flex">
          <span className="flex size-7 items-center justify-center rounded-full bg-ink-700 text-[11px] font-semibold text-cream" aria-hidden>
            SW
          </span>
          {OWNER.fullName}
        </span>
      </header>
      {clock.today === "2000-01-01" ? (
        // The visitor's clock is read after mount; nothing date-based renders before it.
        <div className="flex-1" aria-hidden />
      ) : (
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <AlertBanner />
          <KpiStrip today={clock.today} />
          <DispatchBoard clock={clock} />
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            <Inbox />
            <Outbox />
          </div>
        </div>
      )}
    </div>
  );
}

