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
  maxImageBytes: 1_500_000,
  /** Whole JSON request body. */
  maxBodyBytes: 6_000_000,
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

function sweepMemory(now: number): void {
  if (memory.size < 5000) return;
  for (const [key, bucket] of memory) if (bucket.resetAt <= now) memory.delete(key);
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

/** Counts a live model turn against the global daily budget. */
export async function takeLiveTurn(now: number = Date.now()): Promise<boolean> {
  const dayWindow = Math.floor(now / 86_400_000);
  const used = await hit(`penny:live:${dayWindow}`, 86_400, now);
  return used <= RATE.globalLiveTurnsPerDay;
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64) || "unknown";
  return headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

/** Test hook. */
export function resetRateMemory(): void {
  memory.clear();
}
