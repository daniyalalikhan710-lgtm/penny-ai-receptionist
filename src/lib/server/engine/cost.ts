/**
 * Per-million-token prices (USD) used to show the cost of each turn in X-ray
 * mode. Cache writes are billed at 1.25x the input price (5-minute TTL).
 * Source: Anthropic's published first-party API pricing; check it before
 * relying on these numbers for billing.
 */
interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Returns null for a model that is not in the table rather than guessing. */
export function costUsd(model: string, usage: TokenUsage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const total =
    usage.inputTokens * price.input +
    usage.cacheWriteTokens * price.input * 1.25 +
    usage.cacheReadTokens * price.cacheRead +
    usage.outputTokens * price.output;
  return total / 1_000_000;
}

/** Models that accept the server-side refusal `fallbacks` parameter. */
export function supportsFallbacks(model: string): boolean {
  return /^claude-(opus-5|opus-5-5|sonnet-5-5|fable-5|fable-5-1|fable-5-2)$/.test(model);
}
