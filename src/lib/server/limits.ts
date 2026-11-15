import "server-only";
/**
 * Server-side caps. Every one of these protects the demo owner's bill or the
 * model's context, and every one produces a friendly "demo limit" message
 * rather than an error page.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const CAPS = {
  /** Customer + event turns in one conversation. */
  maxUserTurns: envInt("PENNY_MAX_TURNS", 30),
  /** Total wire messages accepted in one request. */
  maxWireMessages: 140,
  maxMessageChars: envInt("PENNY_MAX_MESSAGE_CHARS", 1500),
  maxImagesPerConversation: envInt("PENNY_MAX_IMAGES", 3),
  /** Decoded bytes of one uploaded image (it is resized client-side first). */
  maxImageBytes: 900_000,
  /**
   * Whole JSON request body. Kept under Vercel's 4.5 MB function payload
   * limit: three photos at the per-image cap plus the transcript still fit.
   */
  maxBodyBytes: 4_300_000,
  /**
   * Characters of text and tool JSON across the whole transcript (photos
   * excluded). The history is client-supplied, so without this a crafted
   * request could push an arbitrarily large prompt to the model.
   */
  maxTranscriptChars: envInt("PENNY_MAX_TRANSCRIPT_CHARS", 60_000),
  maxTokensPerStep: envInt("PENNY_MAX_TOKENS", 4096),
  /** Model round-trips inside one turn. */
  maxToolSteps: 6,
  maxJobsInState: 200,
} as const;

export const RATE = {
  perMinute: envInt("PENNY_RATE_PER_MINUTE", 20),
  perDay: envInt("PENNY_RATE_PER_DAY", 200),
  /** Live model turns across all visitors per UTC day before falling back to replay. */
  globalLiveTurnsPerDay: envInt("PENNY_DAILY_LIVE_TURNS", 1500),
  /** Estimated live spend across all visitors per UTC day, in whole dollars. */
  dailyBudgetUsd: envInt("PENNY_DAILY_BUDGET_USD", 5),
};

export interface RateResult {
  ok: boolean;
  retryAfterSec: number;
  scope: "minute" | "day" | null;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const memory = new Map<string, Bucket>();

function hitMemory(key: string, windowMs: number, now: number): number {
  const bucket = memory.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

const MAX_BUCKETS = 20_000;
let lastSweep = 0;

/**
 * Drops expired buckets at most once a minute, and never lets the map grow
 * without bound: a flood of made-up addresses must not turn the limiter
 * itself into the expensive part of a request.
 */
function sweepMemory(now: number): void {
  if (now - lastSweep >= 60_000 || now < lastSweep) {
    lastSweep = now;
    for (const [key, bucket] of memory) if (bucket.resetAt <= now) memory.delete(key);
  }
  if (memory.size > MAX_BUCKETS) {
    // Per-address buckets go first; the global budget keys are kept.
    for (const key of memory.keys()) {
      if (key.startsWith("penny:rl:")) memory.delete(key);
      if (memory.size <= MAX_BUCKETS / 2) break;
    }
  }
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** INCR with a TTL on first hit, via Upstash's REST pipeline. No SDK needed. */
async function hitUpstash(key: string, windowSec: number): Promise<number | null> {
  const config = upstashConfig();
  if (!config) return null;
  try {
    const res = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSec), "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result?: unknown }>;
    const count = Number(data[0]?.result);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null; // Best effort: fall back to the in-memory limiter.
  }
}

async function hit(key: string, windowSec: number, now: number): Promise<number> {
  const remote = await hitUpstash(key, windowSec);
  if (remote !== null) return remote;
  sweepMemory(now);
  return hitMemory(key, windowSec * 1000, now);
}

/**
 * Best-effort per-IP limiter: Upstash Redis when its env vars are present,
 * in-memory otherwise (per server instance, which is fine for a demo).
 */
export async function checkRate(ip: string, now: number = Date.now()): Promise<RateResult> {
  const minuteWindow = Math.floor(now / 60_000);
  const dayWindow = Math.floor(now / 86_400_000);
  const perMinute = await hit(`penny:rl:m:${ip}:${minuteWindow}`, 60, now);
  if (perMinute > RATE.perMinute) {
    return { ok: false, retryAfterSec: 60 - Math.floor((now % 60_000) / 1000), scope: "minute" };
  }
  const perDay = await hit(`penny:rl:d:${ip}:${dayWindow}`, 86_400, now);
  if (perDay > RATE.perDay) return { ok: false, retryAfterSec: 3600, scope: "day" };
  return { ok: true, retryAfterSec: 0, scope: null };
}

/* ------------------------------------------------------------------ */
/* The global live budget: turns AND estimated spend, per UTC day.     */
/* ------------------------------------------------------------------ */

/** Millionths of a dollar, so the counter can be a plain integer. */
const MICRO = 1_000_000;

async function upstashCommands(commands: string[][]): Promise<unknown[] | null> {
  const config = upstashConfig();
  if (!config) return null;
  const res = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("upstash");
  const data = (await res.json()) as Array<{ result?: unknown }>;
  return data.map((entry) => entry.result);
}

function memoryCounter(key: string, add: number, now: number): number {
  const bucket = memory.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memory.set(key, { count: add, resetAt: now + 86_400_000 });
    return add;
  }
  bucket.count += add;
  return bucket.count;
}

/**
 * Counts a live model turn against today's budget and says whether live mode
 * may still be used. The budget has two parts: a number of turns and an
 * estimated dollar amount (see recordLiveSpend).
 *
 * With Upstash configured the counters are shared by every server instance,
 * and an Upstash failure closes the budget (Penny answers in replay) rather
 * than letting spend go uncounted. Without Upstash the counters are per
 * instance, so on serverless hosting they are a brake, not a ceiling: the real
 * ceiling is the spend limit set on the API key itself.
 */
export async function takeLiveTurn(now: number = Date.now()): Promise<boolean> {
  const day = Math.floor(now / 86_400_000);
  const turnsKey = `penny:live:turns:${day}`;
  const spendKey = `penny:live:spend:${day}`;
  let turns: number;
  let spentMicro: number;
  if (upstashConfig()) {
    try {
      const result = await upstashCommands([
        ["INCR", turnsKey],
        ["EXPIRE", turnsKey, "86400", "NX"],
        ["GET", spendKey],
      ]);
      turns = Number(result?.[0]);
      spentMicro = Number(result?.[2] ?? 0);
      if (!Number.isFinite(turns) || !Number.isFinite(spentMicro)) return false;
    } catch {
      return false;
    }
  } else {
    turns = memoryCounter(turnsKey, 1, now);
    spentMicro = memory.get(spendKey)?.count ?? 0;
  }
  return turns <= RATE.globalLiveTurnsPerDay && spentMicro < RATE.dailyBudgetUsd * MICRO;
}

/** Adds the estimated cost of a model step to today's spend. */
export async function recordLiveSpend(usd: number, now: number = Date.now()): Promise<void> {
  if (!(usd > 0)) return;
  const spendKey = `penny:live:spend:${Math.floor(now / 86_400_000)}`;
  const micro = Math.ceil(usd * MICRO);
  if (upstashConfig()) {
    try {
      await upstashCommands([
        ["INCRBY", spendKey, String(micro)],
        ["EXPIRE", spendKey, "86400", "NX"],
      ]);
      return;
    } catch {
      // Fall through and at least count it locally.
    }
  }
  memoryCounter(spendKey, micro, now);
}

/**
 * The caller's address, used only as the rate-limit key.
 *
 * Which header can be trusted depends on the host, because any header the
 * platform does not overwrite can be forged by the client:
 *  - on Vercel, x-vercel-forwarded-for and x-real-ip are set by the platform;
 *  - elsewhere, set PENNY_CLIENT_IP_HEADER to the header your own proxy sets;
 *  - failing that, the right-most x-forwarded-for entry is used: it is the one
 *    added by the nearest proxy, where the left-most is whatever the client sent.
 */
export function clientIp(headers: Headers, env: NodeJS.ProcessEnv = process.env): string {
  const clean = (value: string | null | undefined) => value?.trim().slice(0, 64) || null;
  if (env.VERCEL) {
    const vercel = clean(headers.get("x-vercel-forwarded-for")?.split(",")[0]) ?? clean(headers.get("x-real-ip"));
    if (vercel) return vercel;
  }
  const custom = env.PENNY_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (custom) {
    const value = clean(headers.get(custom)?.split(",").pop());
    if (value) return value;
  }
  return clean(headers.get("x-forwarded-for")?.split(",").pop()) ?? "unknown";
}

/**
 * True for a request a browser sent from another site. Both routes cost the
 * owner money or change state, so they only accept same-origin JSON: without
 * this, any web page could make its visitors' browsers spend the live budget,
 * each from a different address the per-IP limit has never seen.
 */
export function crossSiteProblem(request: Request): { status: number; reason: string } | null {
  const type = request.headers.get("content-type") ?? "";
  // A JSON content type forces a CORS preflight, which this app never grants.
  if (!type.toLowerCase().startsWith("application/json")) return { status: 415, reason: "Content-Type must be application/json." };
  if (request.headers.get("sec-fetch-site") === "cross-site") return { status: 403, reason: "Cross-site requests are not allowed." };
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return { status: 403, reason: "Cross-site requests are not allowed." };
    } catch {
      return { status: 403, reason: "Cross-site requests are not allowed." };
    }
  }
  return null;
}

/**
 * Reads a request body but gives up once it passes `maxBytes`, so a request
 * with no (or a false) content-length cannot be buffered without limit.
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Test hook. */
export function resetRateMemory(): void {
  memory.clear();
}
