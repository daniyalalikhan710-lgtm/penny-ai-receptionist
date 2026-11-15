import { addDays, diffDays, isDayStr } from "./time";
import { TECHNICIANS, techById } from "./technicians";
import type { Clock, DayStr, Job, SlotOption, Trade } from "./types";

/** Copperline books two-hour arrival windows, seven days a week. */
export const SLOT_STARTS = [480, 600, 720, 840, 960] as const; // 8a, 10a, 12p, 2p, 4p
export const SLOT_DURATION = 120;
export const DAY_START = 480;
export const DAY_END = 1080;
/** How far ahead the public calendar goes (today + 6 more days). */
export const BOOKING_HORIZON_DAYS = 7;
/** A same-day window needs at least this much notice before it starts. */
export const MIN_LEAD_MINUTES = 45;

export function slotId(techId: string, date: DayStr, startMin: number): string {
  return `${techId}|${date}|${startMin}`;
}

export function parseSlotId(id: string): { techId: string; date: DayStr; startMin: number } | null {
  const parts = id.split("|");
  if (parts.length !== 3) return null;
  const [techId, date, start] = parts;
  const startMin = Number(start);
  if (!techById(techId) || !isDayStr(date) || !Number.isInteger(startMin)) return null;
  if (!(SLOT_STARTS as readonly number[]).includes(startMin)) return null;
  return { techId, date, startMin };
}

function overlaps(job: Job, date: DayStr, startMin: number, durationMin: number): boolean {
  if (job.status === "cancelled" || job.date !== date) return false;
  return job.startMin < startMin + durationMin && startMin < job.startMin + job.durationMin;
}

export type SlotProblem =
  | "unknown_slot"
  | "outside_horizon"
  | "in_the_past"
  | "wrong_trade"
  | "taken";

/**
 * The single availability check. Every tool that touches the calendar goes
 * through this, so a slot the client claims is free is always re-verified.
 */
export function checkSlot(
  id: string,
  trade: Trade,
  jobs: Job[],
  clock: Clock,
  ignoreJobCode?: string,
): { ok: true; slot: SlotOption } | { ok: false; problem: SlotProblem } {
  const parsed = parseSlotId(id);
  if (!parsed) return { ok: false, problem: "unknown_slot" };
  const tech = techById(parsed.techId);
  if (!tech) return { ok: false, problem: "unknown_slot" };
  const delta = diffDays(parsed.date, clock.today);
  if (delta < 0 || delta >= BOOKING_HORIZON_DAYS) return { ok: false, problem: "outside_horizon" };
  if (delta === 0 && parsed.startMin < clock.nowMinutes + MIN_LEAD_MINUTES) {
    return { ok: false, problem: "in_the_past" };
  }
  if (!tech.trades.includes(trade)) return { ok: false, problem: "wrong_trade" };
  const taken = jobs.some(
    (job) =>
      job.techId === tech.id &&
      job.code !== ignoreJobCode &&
      overlaps(job, parsed.date, parsed.startMin, SLOT_DURATION),
  );
  if (taken) return { ok: false, problem: "taken" };
  return {
    ok: true,
    slot: {
      id,
      techId: tech.id,
      techName: tech.name,
      date: parsed.date,
      startMin: parsed.startMin,
      durationMin: SLOT_DURATION,
    },
  };
}

export interface FindSlotsOptions {
  trade: Trade;
  jobs: Job[];
  clock: Clock;
  /** When set, only this day is searched first; falls back to all days if it is full. */
  preferredDate?: DayStr | null;
  /** A booking being moved: its own slot does not block itself. */
  ignoreJobCode?: string;
  limit?: number;
}

/**
 * Earliest open windows for a trade. One option per distinct window; when two
 * technicians are free at the same time the specialist is offered first so the
 * dual-trade technician stays flexible.
 */
export function findSlots(options: FindSlotsOptions): SlotOption[] {
  const { trade, jobs, clock, preferredDate, ignoreJobCode } = options;
  const limit = options.limit ?? 4;
  const techs = TECHNICIANS.filter((t) => t.trades.includes(trade)).sort(
    (a, b) => a.trades.length - b.trades.length,
  );

  const collect = (days: DayStr[]): SlotOption[] => {
    const found: SlotOption[] = [];
    for (const date of days) {
      for (const startMin of SLOT_STARTS) {
        for (const tech of techs) {
          const result = checkSlot(slotId(tech.id, date, startMin), trade, jobs, clock, ignoreJobCode);
          if (result.ok) {
            found.push(result.slot);
            break; // one technician per window
          }
        }
        if (found.length >= limit) return found;
      }
    }
    return found;
  };

  const allDays = Array.from({ length: BOOKING_HORIZON_DAYS }, (_, i) => addDays(clock.today, i));
  if (preferredDate && allDays.includes(preferredDate)) {
    const preferred = collect([preferredDate]);
    if (preferred.length > 0) return preferred;
  }
  return collect(allDays);
}
