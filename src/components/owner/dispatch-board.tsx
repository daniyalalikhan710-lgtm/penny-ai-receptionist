"use client";

import { Camera, Sparkles } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { URGENCY_CLASS, urgencyLabel } from "@/lib/client/i18n";
import { useDemo } from "@/lib/client/store";
import { sampleById } from "@/lib/domain/samples";
import { BOOKING_HORIZON_DAYS, SLOT_DURATION, SLOT_STARTS } from "@/lib/domain/slots";
import { TECHNICIANS } from "@/lib/domain/technicians";
import { addDays, fmtDay, fmtDayRelative, fmtMoney, fmtTime, fmtWindow } from "@/lib/domain/time";
import type { Clock, Job } from "@/lib/domain/types";
import { TechAvatar } from "./tech-avatar";

type Progress = "held" | "scheduled" | "now" | "done";

function progressOf(job: Job, clock: Clock): Progress {
  if (job.status === "pending_payment") return "held";
  if (job.date < clock.today) return "done";
  if (job.date > clock.today) return "scheduled";
  if (clock.nowMinutes >= job.startMin + job.durationMin) return "done";
  if (clock.nowMinutes >= job.startMin) return "now";
  return "scheduled";
}

const PROGRESS_LABEL: Record<Progress, string> = { held: "Held", scheduled: "Scheduled", now: "On site", done: "Done" };

function JobPhoto({ job, size }: { job: Job; size: number }) {
  const uploadThumb = useDemo((s) => {
    if (job.photo?.kind !== "upload") return null;
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i];
      if (m.role === "user" && m.image?.kind === "upload") return m.image.thumb;
    }
    return null;
  });
  if (!job.photo) return null;
  if (job.photo.kind === "sample") {
    const sample = sampleById(job.photo.sampleId);
    if (!sample) return null;
    return <Image src={sample.thumb} alt={`Customer photo: ${sample.alt}`} width={size} height={size} className="shrink-0 rounded-md object-cover" style={{ width: size, height: size }} />;
  }
  if (!uploadThumb) return null;
  // eslint-disable-next-line @next/next/no-img-element -- data: URL thumbnail from the visitor's own upload
  return <img src={uploadThumb} alt="Customer photo" className="shrink-0 rounded-md object-cover" style={{ width: size, height: size }} />;
}

function JobCard({ job, clock, onOpen }: { job: Job; clock: Clock; onOpen: (job: Job) => void }) {
  const landed = useDemo((s) => s.justLanded.includes(job.code));
  const flying = useDemo((s) => s.flights.some((f) => f.jobCode === job.code));
  const clearLanded = useDemo((s) => s.clearLanded);
  const progress = progressOf(job, clock);
  const urgency = URGENCY_CLASS[job.urgency];

  useEffect(() => {
    if (!landed) return;
    const timer = window.setTimeout(() => clearLanded(job.code), 2200);
    return () => window.clearTimeout(timer);
  }, [landed, clearLanded, job.code]);

  return (
    <button
      type="button"
      data-job-code={job.code}
      data-testid="job-card"
      data-status={job.status}
      onClick={() => onOpen(job)}
      aria-label={`${job.code}: ${job.serviceName} for ${job.customerName}, ${PROGRESS_LABEL[progress]}${job.source === "penny" ? ", booked by Penny" : ""}`}
      className={cn(
        "flex h-full w-full flex-col gap-0.5 rounded-lg border border-l-4 bg-white p-1.5 text-left transition hover:shadow-md",
        urgency.bar,
        progress === "held" ? "animate-pulse-soft border-dashed border-copper-400 bg-copper-50" : "border-ink-100",
        progress === "done" && "opacity-60",
        landed && "animate-land ring-2 ring-copper-500",
        flying && "opacity-0",
      )}
    >
      <span className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[11.5px] leading-tight font-semibold text-ink-900">{job.customerName}</span>
        {job.source === "penny" && (
          <span title="Booked by Penny" className="flex shrink-0 items-center gap-0.5 rounded-full bg-copper-100 px-1 py-px text-[9px] font-bold text-copper-800">
            <Sparkles className="size-2.5" aria-hidden /> Penny
          </span>
        )}
      </span>
      <span className="truncate text-[10.5px] leading-tight text-ink-600">{job.serviceName}</span>
      <span className="mt-auto flex items-center gap-1 pt-0.5">
        {job.photo ? <Camera className="size-3 shrink-0 text-ink-500" aria-hidden /> : null}
        <span
          className={cn(
            "rounded px-1 py-px text-[9.5px] leading-tight font-semibold",
            progress === "held" && "bg-copper-200 text-copper-900",
            progress === "scheduled" && "bg-ink-100 text-ink-700",
            progress === "now" && "bg-emerald-100 text-emerald-900",
            progress === "done" && "bg-ink-100 text-ink-600",
          )}
        >
          {PROGRESS_LABEL[progress]}
        </span>
        <span className="ml-auto font-mono text-[9.5px] text-ink-500">{job.code.replace("CPL-", "#")}</span>
      </span>
    </button>
  );
}

function JobDialog({ job, clock, onClose }: { job: Job | null; clock: Clock; onClose: () => void }) {
  const tech = TECHNICIANS.find((t) => t.id === job?.techId);
  return (
    <Dialog open={Boolean(job)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        {job && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-lg">
                {job.serviceName}
                <span className="font-mono text-xs font-medium text-ink-500">{job.code}</span>
              </DialogTitle>
              <DialogDescription>
                {fmtDayRelative(job.date, clock.today)} · {fmtWindow(job.startMin, job.durationMin)} · {tech?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-[13.5px]">
              <div className="flex gap-3">
                <JobPhoto job={job} size={88} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{job.source === "penny" ? "Penny's summary" : "Job notes"}</p>
                  <p className="mt-0.5 leading-snug text-ink-900">{job.summary}</p>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-ink-50 p-3">
                <dt className="text-ink-500">Customer</dt>
                <dd className="font-medium text-ink-900">{job.customerName} · {job.phone}</dd>
                <dt className="text-ink-500">Address</dt>
                <dd className="font-medium text-ink-900">{job.address}</dd>
                <dt className="text-ink-500">Urgency</dt>
                <dd>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", URGENCY_CLASS[job.urgency].chip)}>{urgencyLabel(job.urgency)}</span>
                </dd>
                <dt className="text-ink-500">Estimate</dt>
                <dd className="font-medium text-ink-900 tabular-nums">{fmtMoney(job.estLow)}–{fmtMoney(job.estHigh)}</dd>
                <dt className="text-ink-500">Diagnostic fee</dt>
                <dd className="font-medium text-ink-900">{job.feePaid ? `${fmtMoney(job.feeDue)} paid` : `${fmtMoney(job.feeDue)} pending`}</dd>
                <dt className="text-ink-500">Booked via</dt>
                <dd className="font-medium text-ink-900">{job.source === "penny" ? `Penny (AI) at ${fmtTime(job.createdAtMin)}` : job.source === "phone" ? "Phone" : "Web form"}</dd>
              </dl>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DispatchBoard({ clock }: { clock: Clock }) {
  const jobs = useDemo((s) => s.jobs);
  const boardDay = useDemo((s) => s.boardDay);
  const setBoardDay = useDemo((s) => s.setBoardDay);
  const [open, setOpen] = useState<Job | null>(null);
  const days = Array.from({ length: BOOKING_HORIZON_DAYS }, (_, i) => addDays(clock.today, i));
  const day = boardDay && days.includes(boardDay) ? boardDay : clock.today;
  const visible = jobs.filter((job) => job.date === day && job.status !== "cancelled");
  const currentSlot = day === clock.today ? SLOT_STARTS.find((s) => clock.nowMinutes >= s && clock.nowMinutes < s + SLOT_DURATION) : undefined;

  return (
    <section aria-labelledby="board-title" className="rounded-2xl border border-ink-100 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-100 px-3 py-2.5">
        <h2 id="board-title" className="text-[13px] font-semibold text-ink-900">
          Dispatch board
        </h2>
        <div role="tablist" aria-label="Day" className="scroll-thin -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
          {days.map((d) => {
            const count = jobs.filter((j) => j.date === d && j.status !== "cancelled").length;
            const selected = d === day;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`board-day-${d}`}
                onClick={() => setBoardDay(d)}
                className={cn(
                  "flex min-h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-medium transition",
                  selected ? "bg-ink-900 text-cream" : "text-ink-700 hover:bg-ink-100",
                )}
              >
                {d === clock.today ? "Today" : fmtDay(d).split(",")[0] + " " + fmtDay(d).split(" ").pop()}
                <span className={cn("rounded px-1 text-[10px] tabular-nums", selected ? "bg-white/20" : "bg-ink-100 text-ink-600")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="scroll-thin overflow-x-auto p-2">
        <div role="table" aria-label={`Jobs for ${fmtDayRelative(day, clock.today)}`} className="grid min-w-[560px] grid-cols-[92px_repeat(5,minmax(0,1fr))] gap-1">
          <div role="row" className="contents">
            <div role="columnheader">
              <span className="sr-only">Technician</span>
            </div>
            {SLOT_STARTS.map((start) => (
              <div
                key={start}
                role="columnheader"
                className={cn(
                  "rounded-md px-1 py-1 text-center text-[10.5px] font-semibold tabular-nums",
                  currentSlot === start ? "bg-copper-100 text-copper-900" : "text-ink-500",
                )}
              >
                {fmtTime(start).replace(":00", "")}
                {currentSlot === start ? <span className="ml-1 font-bold">now</span> : null}
              </div>
            ))}
          </div>
          {TECHNICIANS.map((tech) => (
            <div role="row" key={tech.id} className="contents">
              <div role="rowheader" className="flex items-center gap-1.5 pr-1">
                <TechAvatar techId={tech.id} size={26} />
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] leading-tight font-semibold text-ink-900">{tech.name.split(" ")[0]}</span>
                  <span className="block truncate text-[9.5px] leading-tight text-ink-500">{tech.title}</span>
                </span>
              </div>
              {SLOT_STARTS.map((start) => {
                const job = visible.find((j) => j.techId === tech.id && j.startMin === start);
                return (
                  <div
                    role="cell"
                    key={start}
                    data-job-cell={`${tech.id}|${day}|${start}`}
                    className={cn("h-[66px] rounded-lg", !job && "border border-dashed border-ink-100 bg-ink-50/60")}
                  >
                    {job ? <JobCard job={job} clock={clock} onOpen={setOpen} /> : <span className="sr-only">Open</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-100 px-3 py-2 text-[10.5px] text-ink-600">
        {(["routine", "soon", "urgent", "emergency"] as const).map((u) => (
          <span key={u} className="flex items-center gap-1">
            <span className={cn("size-2 rounded-sm", URGENCY_CLASS[u].dot)} aria-hidden /> {urgencyLabel(u)}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <Sparkles className="size-3 text-copper-600" aria-hidden /> Booked by Penny
        </span>
      </div>
      <JobDialog job={open} clock={clock} onClose={() => setOpen(null)} />
    </section>
  );
}
