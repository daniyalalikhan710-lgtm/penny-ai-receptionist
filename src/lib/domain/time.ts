import type { Clock, DayStr, Lang } from "./types";

/**
 * All scheduling works on "local calendar day + minutes since midnight" pairs,
 * so the server never has to do timezone maths with the visitor's zone.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayStr(value: string): value is DayStr {
  if (!DAY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUtc(day: DayStr): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): DayStr {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(day: DayStr, n: number): DayStr {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + n);
  return fromUtc(date);
}

export function diffDays(a: DayStr, b: DayStr): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: DayStr): number {
  return toUtc(day).getUTCDay();
}

/** Calendar day for a Date, using that Date's *local* fields. */
export function localDayStr(date: Date): DayStr {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function localMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function clockFromDate(date: Date): Clock {
  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    // Intl can be unavailable in exotic runtimes; the zone is informational.
  }
  return { today: localDayStr(date), nowMinutes: localMinutes(date), tz };
}

const WEEKDAYS: Record<Lang, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  es: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
};
const WEEKDAYS_LONG: Record<Lang, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
};
const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};

export function fmtTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "2:00–4:00 PM" or "10:00 AM–12:00 PM". */
export function fmtWindow(startMin: number, durationMin: number): string {
  const start = fmtTime(startMin);
  const end = fmtTime(startMin + durationMin);
  const startSuffix = start.slice(-2);
  const endSuffix = end.slice(-2);
  if (startSuffix === endSuffix) return `${start.slice(0, -3)}–${end}`;
  return `${start}–${end}`;
}

/** "Wed, Nov 18" */
export function fmtDay(day: DayStr, lang: Lang = "en"): string {
  const date = toUtc(day);
  const wd = WEEKDAYS[lang][date.getUTCDay()];
  const mon = MONTHS[lang][date.getUTCMonth()];
  return lang === "es" ? `${wd} ${date.getUTCDate()} ${mon}` : `${wd}, ${mon} ${date.getUTCDate()}`;
}

/** "Today", "Tomorrow", or "Wed, Nov 18". */
export function fmtDayRelative(day: DayStr, today: DayStr, lang: Lang = "en"): string {
  const delta = diffDays(day, today);
  if (delta === 0) return lang === "es" ? "Hoy" : "Today";
  if (delta === 1) return lang === "es" ? "Mañana" : "Tomorrow";
  return fmtDay(day, lang);
}

export function fmtDayLong(day: DayStr, lang: Lang = "en"): string {
  const date = toUtc(day);
  const wd = WEEKDAYS_LONG[lang][date.getUTCDay()];
  const mon = MONTHS[lang][date.getUTCMonth()];
  return lang === "es"
    ? `${wd} ${date.getUTCDate()} de ${mon}`
    : `${wd}, ${mon} ${date.getUTCDate()}`;
}

/** Human stamp a model can read: "Tue 2026-11-17 10:32 AM". */
export function fmtStamp(clock: Pick<Clock, "today" | "nowMinutes">): string {
  const wd = WEEKDAYS.en[dayOfWeek(clock.today)];
  return `${wd} ${clock.today} ${fmtTime(clock.nowMinutes)}`;
}

/** iCalendar "floating" local timestamp: 20261117T140000. */
export function icsLocal(day: DayStr, min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${day.replaceAll("-", "")}T${h}${m}00`;
}

export function fmtMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
