/**
 * Eval runner.
 *
 *   pnpm eval           live: real conversations against the Claude API (costs cents)
 *   pnpm eval:replay    the same cases through the scripted replay engine (free)
 *
 * Options: --only id1,id2   --verbose
 * Exits 0 when everything passes (or when there is no API key to run live with),
 * 1 when any check fails.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { clockFromDate } from "../src/lib/domain/time";
import type { Clock } from "../src/lib/domain/types";
import { configuredModel } from "../src/lib/server/engine";
import { DemoDriver } from "../src/lib/testing/driver";
import { CASES, type Check, type Mode } from "./cases";

const args = process.argv.slice(2);
const replay = args.includes("--replay");
const verbose = args.includes("--verbose");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? (args[onlyIndex + 1] ?? "").split(",").filter(Boolean) : [];

// Next.js loads .env.local for the app; a plain script has to do it itself.
if (existsSync(".env.local")) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // An unreadable env file just means "no key".
  }
}
process.env.PENNY_REPLAY_PACE = "0";

const mode: Mode = replay ? "replay" : "live";

if (mode === "live" && !process.env.ANTHROPIC_API_KEY?.trim()) {
  console.log("no API key, skipped (set ANTHROPIC_API_KEY in .env.local, or run `pnpm eval:replay`)");
  process.exit(0);
}

/** Mid-morning today, so same-day slots exist and the run is repeatable. */
function evalClock(): Clock {
  const now = new Date();
  now.setHours(10, 30, 0, 0);
  return clockFromDate(now);
}

function usd(value: number): string {
  return "$" + value.toFixed(4);
}

interface CaseResult {
  id: string;
  title: string;
  status: "pass" | "fail" | "skipped" | "error";
  checks: Check[];
  costUsd: number;
  turns: number;
  ms: number;
  error?: string;
}

async function main(): Promise<void> {
  const model = mode === "live" ? configuredModel() : "replay";
  console.log("\nPenny evals · " + mode + (mode === "live" ? " · " + model : "") + "\n");
  const results: CaseResult[] = [];

  for (const testCase of CASES) {
    if (only.length > 0 && !only.includes(testCase.id)) continue;
    if (testCase.liveOnly && mode === "replay") {
      results.push({ id: testCase.id, title: testCase.title, status: "skipped", checks: [], costUsd: 0, turns: 0, ms: 0 });
      console.log("  SKIP  " + testCase.id + "  (needs the live model)");
      continue;
    }
    const driver = new DemoDriver(
      evalClock(),
      mode === "live" ? { mode: "live", skipBudget: true } : { mode: "replay", replayPace: 0, skipBudget: true },
    );
    const started = performance.now();
    let checks: Check[] = [];
    let error: string | undefined;
    try {
      checks = await testCase.run(driver, mode);
    } catch (caught) {
      error = caught instanceof Error ? caught.name + ": " + caught.message : String(caught);
    }
    const costUsd = driver.turns.reduce((sum, turn) => sum + turn.usage.reduce((s, u) => s + (u.costUsd ?? 0), 0), 0);
    const failed = checks.filter((c) => !c.pass);
    const status: CaseResult["status"] = error ? "error" : failed.length > 0 ? "fail" : "pass";
    results.push({
      id: testCase.id,
      title: testCase.title,
      status,
      checks,
      costUsd,
      turns: driver.turns.length,
      ms: Math.round(performance.now() - started),
      error,
    });

    const label = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "ERR ";
    const cost = mode === "live" ? "  " + usd(costUsd) : "";
    console.log("  " + label + "  " + testCase.id + "  " + (checks.length - failed.length) + "/" + checks.length + " checks" + cost);
    if (error) console.log("        " + error);
    for (const c of checks) {
      if (!c.pass) console.log("        ✗ " + c.name + (c.detail ? "\n          got: " + c.detail.slice(0, 400) : ""));
      else if (verbose) console.log("        ✓ " + c.name);
    }
    if (verbose || status !== "pass") {
      const lastText = driver.lastText;
      if (lastText) console.log("        last reply: " + lastText.replace(/\s+/g, " ").slice(0, 300));
    }
  }

  const ran = results.filter((r) => r.status !== "skipped");
  const passed = ran.filter((r) => r.status === "pass").length;
  const totalChecks = ran.reduce((n, r) => n + r.checks.length, 0);
  const passedChecks = ran.reduce((n, r) => n + r.checks.filter((c) => c.pass).length, 0);
  const totalCost = ran.reduce((n, r) => n + r.costUsd, 0);
  const skipped = results.length - ran.length;

  console.log(
    "\n" + passed + "/" + ran.length + " cases passed · " + passedChecks + "/" + totalChecks + " checks" + (skipped ? " · " + skipped + " skipped (live only)" : ""),
  );
  if (mode === "live") {
    const conversations = ran.filter((r) => r.turns > 0 && r.costUsd > 0);
    const average = conversations.length ? totalCost / conversations.length : 0;
    console.log("total cost " + usd(totalCost) + " · average " + usd(average) + " per conversation (" + model + ")");
  }

  mkdirSync(path.resolve("evals/results"), { recursive: true });
  const summary = {
    mode,
    model,
    ranAt: new Date().toISOString(),
    cases: { passed, total: ran.length, skipped },
    checks: { passed: passedChecks, total: totalChecks },
    totalCostUsd: Number(totalCost.toFixed(6)),
    results: results.map((r) => ({
      id: r.id,
      status: r.status,
      checks: r.checks.filter((c) => c.pass).length + "/" + r.checks.length,
      costUsd: Number(r.costUsd.toFixed(6)),
      turns: r.turns,
      ms: r.ms,
      failed: r.checks.filter((c) => !c.pass).map((c) => c.name),
      error: r.error,
    })),
  };
  writeFileSync(path.resolve("evals/results", "latest-" + mode + ".json"), JSON.stringify(summary, null, 2) + "\n");

  process.exit(passed === ran.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
