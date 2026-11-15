/**
 * Prints what the live API actually reports, step by step, for a short
 * conversation: tokens, cache writes and reads, cost, citations and the reply.
 * Use it to confirm prompt caching is working after changing the prompt,
 * the tools or the documents.
 *
 *   pnpm tsx --conditions=react-server evals/usage.ts
 *
 * Costs a few cents. Needs ANTHROPIC_API_KEY in .env.local.
 */
import { existsSync } from "node:fs";
import { turnCitations, turnText, turnTools, type AssistantTurn } from "../src/lib/domain/chat";
import { clockFromDate } from "../src/lib/domain/time";
import { DOCS } from "../src/lib/server/docs";
import { DemoDriver } from "../src/lib/testing/driver";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.log("no API key, skipped");
  process.exit(0);
}

function show(label: string, turn: AssistantTurn): number {
  console.log("\n" + label);
  let cost = 0;
  for (const u of turn.usage) {
    cost += u.costUsd ?? 0;
    console.log(
      "  step " + u.step + " · " + u.model + " · input " + u.inputTokens + " · cache_read " + u.cacheReadTokens + " · cache_write " + u.cacheWriteTokens + " · output " + u.outputTokens + " · " + u.ms + "ms · $" + (u.costUsd ?? 0).toFixed(4),
    );
  }
  console.log("  tools: " + (turnTools(turn).map((t) => t.name).join(", ") || "(none)"));
  for (const c of turnCitations(turn)) {
    const doc = DOCS.find((d) => d.id === c.docId);
    const exact = doc?.text.slice(c.start, c.end) === c.quote;
    console.log("  cites " + c.docId + " [" + c.start + "–" + c.end + "] " + (exact ? "exact match" : "MISMATCH") + ": “" + c.quote.replace(/\s+/g, " ").slice(0, 90) + "”");
  }
  console.log("  reply: " + turnText(turn).replace(/\s+/g, " ").slice(0, 420));
  for (const n of turn.notices) console.log("  notice " + n.code + ": " + n.message);
  return cost;
}

async function main(): Promise<void> {
  const now = new Date();
  now.setHours(10, 30, 0, 0);
  const d = new DemoDriver(clockFromDate(now), { mode: "live", skipBudget: true });
  let total = 0;
  total += show("Turn 1: warranty question (expects citations)", await d.send("What's your warranty on repairs?"));
  total += show("Turn 2: follow-up in the same conversation (expects a large cache_read)", await d.send("And what if I cancel the day before?"));
  const fresh = new DemoDriver(clockFromDate(now), { mode: "live", skipBudget: true });
  total += show("New conversation (expects the shared prefix to be read from cache, not rewritten)", await fresh.send("Do you service 97406?"));
  console.log("\ntotal $" + total.toFixed(4));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
