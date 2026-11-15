"use client";

import { BookOpen, ChevronRight, Database, ScanSearch, Wrench, X, Zap } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useDemo } from "@/lib/client/store";
import { turnCitations, turnTools, type AssistantTurn, type ChatMessage } from "@/lib/domain/chat";

interface TurnRow {
  index: number;
  prompt: string;
  turn: AssistantTurn;
  responseMs: number | null;
}

function describeTrigger(message: ChatMessage | undefined): string {
  if (!message) return "(start)";
  if (message.role === "user") return message.text || "(photo)";
  if (message.role === "event") {
    switch (message.event.kind) {
      case "slot_selected":
        return "Tapped a slot";
      case "details_submitted":
        return "Submitted details form";
      case "payment_confirmed":
        return "Payment succeeded";
      case "callback_requested":
        return "Requested a callback";
      case "handback":
        return "Handed back to Penny";
    }
  }
  return "";
}

function usd(value: number): string {
  if (value === 0) return "$0.00";
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(3)}`;
}

function Json({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? "null";
  } catch {
    text = String(value);
  }
  return (
    <pre className="scroll-thin max-h-44 overflow-auto rounded-md bg-ink-950 p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-ink-100">
      {text}
    </pre>
  );
}

function TurnCard({ row }: { row: TurnRow }) {
  const tools = turnTools(row.turn);
  const citations = turnCitations(row.turn);
  const usage = row.turn.usage;
  const totals = usage.reduce(
    (acc, u) => ({
      input: acc.input + u.inputTokens,
      output: acc.output + u.outputTokens,
      cacheRead: acc.cacheRead + u.cacheReadTokens,
      cacheWrite: acc.cacheWrite + u.cacheWriteTokens,
      cost: acc.cost + (u.costUsd ?? 0),
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
  );
  const live = row.turn.mode === "live";

  return (
    <article className="rounded-xl border border-ink-700 bg-ink-800 p-3" data-testid="xray-turn">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink-200">Turn {row.index}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-cream">{row.prompt}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", live ? "bg-emerald-400/15 text-emerald-300" : "bg-copper-400/15 text-copper-300")}>
          {live ? (row.turn.model ?? "live") : "replay"}
        </span>
        {row.turn.totalMs !== null ? <span className="font-mono text-[10.5px] text-ink-300">{(row.turn.totalMs / 1000).toFixed(1)}s total</span> : null}
        {row.responseMs !== null ? <span className="font-mono text-[10.5px] text-ink-300">{row.responseMs}ms to first output</span> : null}
      </header>

      <div className="mt-2.5 grid gap-3 @3xl:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-300 uppercase">
            <Wrench className="size-3.5" aria-hidden /> Tool calls ({tools.length})
          </h4>
          {tools.length === 0 ? (
            <p className="text-[12px] text-ink-400">No tools needed for this turn.</p>
          ) : (
            <ul className="space-y-1.5">
              {tools.map((tool) => (
                <li key={tool.id}>
                  <details className="group rounded-lg bg-ink-900">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-cream hover:bg-ink-700">
                      <ChevronRight className="size-3.5 shrink-0 text-ink-400 transition group-open:rotate-90" aria-hidden />
                      <code className="min-w-0 flex-1 truncate font-mono font-semibold" data-testid="xray-tool-name">
                        {tool.name}
                      </code>
                      {tool.isError ? <span className="rounded bg-red-500/20 px-1.5 py-px text-[10px] font-semibold text-red-300">error</span> : null}
                      {tool.card ? <span className="rounded bg-copper-400/15 px-1.5 py-px text-[10px] font-semibold text-copper-300">card: {tool.card.kind}</span> : null}
                      <span className="font-mono text-[10.5px] text-ink-400">{tool.ms}ms</span>
                    </summary>
                    <div className="grid gap-2 p-2 @2xl:grid-cols-2">
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-semibold tracking-wide text-ink-400 uppercase">Input</p>
                        <Json value={tool.input} />
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-semibold tracking-wide text-ink-400 uppercase">Output</p>
                        <Json value={tool.output} />
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {citations.length > 0 && (
            <>
              <h4 className="mt-3 mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-300 uppercase">
                <BookOpen className="size-3.5" aria-hidden /> Citations ({citations.length})
              </h4>
              <ul className="space-y-1">
                {citations.map((c, i) => (
                  <li key={i} className="rounded-lg bg-ink-900 px-2 py-1.5 text-[11.5px] leading-snug text-ink-100">
                    <span className="font-semibold text-copper-300">{c.docTitle}</span>
                    <span className="text-ink-400"> · chars {c.start}–{c.end}</span>
                    <span className="mt-0.5 block text-ink-200">&ldquo;{c.quote.length > 140 ? `${c.quote.slice(0, 140)}…` : c.quote}&rdquo;</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="min-w-0">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-300 uppercase">
            <Database className="size-3.5" aria-hidden /> Tokens &amp; cost
          </h4>
          {usage.length === 0 ? (
            <p className="rounded-lg bg-ink-900 px-2.5 py-2 text-[12px] leading-snug text-ink-300" data-testid="xray-no-usage">
              {live
                ? "No usage was reported for this turn."
                : "Replay mode: no model was called, so this turn used 0 tokens and cost $0. The tool calls and citations on the left are real. With an API key, each model step shows input, output and cache-read tokens here."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg bg-ink-900">
              <table className="w-full text-right font-mono text-[10.5px] text-ink-100">
                <thead className="text-ink-400">
                  <tr>
                    <th scope="col" className="px-2 py-1 text-left font-medium">Step</th>
                    <th scope="col" className="px-2 py-1 font-medium">Input</th>
                    <th scope="col" className="px-2 py-1 font-medium text-emerald-300">Cache read</th>
                    <th scope="col" className="px-2 py-1 font-medium">Cache write</th>
                    <th scope="col" className="px-2 py-1 font-medium">Output</th>
                    <th scope="col" className="px-2 py-1 font-medium">ms</th>
                    <th scope="col" className="px-2 py-1 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u) => (
                    <tr key={u.step} className="border-t border-ink-700">
                      <td className="px-2 py-1 text-left">{u.step}</td>
                      <td className="px-2 py-1">{u.inputTokens.toLocaleString()}</td>
                      <td className="px-2 py-1 text-emerald-300">{u.cacheReadTokens.toLocaleString()}</td>
                      <td className="px-2 py-1">{u.cacheWriteTokens.toLocaleString()}</td>
                      <td className="px-2 py-1">{u.outputTokens.toLocaleString()}</td>
                      <td className="px-2 py-1">{u.ms}</td>
                      <td className="px-2 py-1">{u.costUsd === null ? "n/a" : usd(u.costUsd)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-ink-600 font-semibold text-cream">
                    <td className="px-2 py-1 text-left">Turn</td>
                    <td className="px-2 py-1">{totals.input.toLocaleString()}</td>
                    <td className="px-2 py-1 text-emerald-300">{totals.cacheRead.toLocaleString()}</td>
                    <td className="px-2 py-1">{totals.cacheWrite.toLocaleString()}</td>
                    <td className="px-2 py-1">{totals.output.toLocaleString()}</td>
                    <td className="px-2 py-1" />
                    <td className="px-2 py-1">{usd(totals.cost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {row.turn.notices.length > 0 && (
            <ul className="mt-2 space-y-1">
              {row.turn.notices.map((n, i) => (
                <li key={i} className="rounded-lg bg-amber-400/10 px-2 py-1.5 text-[11.5px] leading-snug text-amber-200">
                  <code className="font-mono font-semibold">{n.code}</code> · {n.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * X-ray mode: what actually happened on each turn. Tool calls with their
 * inputs and outputs, the citations used, and (in live mode) tokens, cache
 * reads, latency and cost. Built for the technical buyer.
 */
export function XrayPanel() {
  const messages = useDemo((s) => s.messages);
  const setXray = useDemo((s) => s.setXray);
  const mode = useDemo((s) => s.mode);

  const rows = useMemo(() => {
    const out: TurnRow[] = [];
    messages.forEach((message, i) => {
      if (message.role !== "assistant") return;
      let trigger: ChatMessage | undefined;
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === "user" || messages[j].role === "event") {
          trigger = messages[j];
          break;
        }
      }
      out.push({ index: out.length + 1, prompt: describeTrigger(trigger), turn: message.turn, responseMs: message.responseMs });
    });
    return out.reverse();
  }, [messages]);

  const totals = useMemo(() => {
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let cost = 0;
    let tools = 0;
    for (const row of rows) {
      tools += turnTools(row.turn).length;
      for (const u of row.turn.usage) {
        input += u.inputTokens;
        output += u.outputTokens;
        cacheRead += u.cacheReadTokens;
        cacheWrite += u.cacheWriteTokens;
        cost += u.costUsd ?? 0;
      }
    }
    const prompt = input + cacheRead + cacheWrite;
    return { input, output, cacheRead, cacheWrite, cost, tools, cachedShare: prompt > 0 ? cacheRead / prompt : 0 };
  }, [rows]);

  return (
    <aside aria-label="X-ray: how Penny produced each reply" className="on-dark @container flex h-full min-h-0 flex-col bg-ink-900 text-cream" data-testid="xray-panel">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-ink-700 px-4 py-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <ScanSearch className="size-4 text-copper-300" aria-hidden /> X-ray
          <span className="hidden font-normal text-ink-300 @xl:inline">every tool call, citation and token, per turn</span>
        </h2>
        <dl className="flex flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-1 font-mono text-[11px] text-ink-200">
          <div className="flex gap-1.5">
            <dt className="text-ink-400">turns</dt>
            <dd>{rows.length}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-400">tool calls</dt>
            <dd>{totals.tools}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-400">tokens in / out</dt>
            <dd>
              {(totals.input + totals.cacheRead + totals.cacheWrite).toLocaleString()} / {totals.output.toLocaleString()}
            </dd>
          </div>
          <div className={cn("items-center gap-1.5 text-emerald-300", totals.input + totals.cacheRead + totals.cacheWrite > 0 ? "flex" : "hidden")}>
            <dt className="flex items-center gap-1 text-emerald-400">
              <Zap className="size-3" aria-hidden /> served from cache
            </dt>
            <dd>{Math.round(totals.cachedShare * 100)}%</dd>
          </div>
          <div className="flex gap-1.5 font-semibold text-cream">
            <dt className="font-normal text-ink-400">conversation cost</dt>
            <dd data-testid="xray-total-cost">{usd(totals.cost)}</dd>
          </div>
        </dl>
        <button type="button" onClick={() => setXray(false)} aria-label="Close X-ray" className="flex size-7 items-center justify-center rounded-md text-ink-300 hover:bg-ink-700">
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {rows.length === 0 ? (
          <p className="mx-auto max-w-md py-6 text-center text-[13px] leading-relaxed text-ink-300">
            Send Penny a message and each turn shows up here: which tools she called and with what input, what they returned, which document passages she cited, and what it cost.
            {mode === "replay" ? " In replay mode the tools and citations are real; token counts appear once an API key is configured." : ""}
          </p>
        ) : (
          rows.map((row) => <TurnCard key={row.index} row={row} />)
        )}
      </div>
    </aside>
  );
}
