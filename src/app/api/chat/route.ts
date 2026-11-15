import { chatRequestSchema } from "@/lib/domain/schemas";
import { LIVE_LEAD_ID } from "@/lib/domain/seed";
import { techById } from "@/lib/domain/technicians";
import { diffDays, localDayStr } from "@/lib/domain/time";
import type { StreamEvent } from "@/lib/domain/types";
import { resolveMode, runTurn } from "@/lib/server/engine";
import { CAPS, checkRate, clientIp, crossSiteProblem, readBodyCapped } from "@/lib/server/limits";

export const maxDuration = 60;

const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" };

function json(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** A complete, tiny event stream carrying one notice. */
function noticeStream(status: number, event: Extract<StreamEvent, { type: "notice" }>): Response {
  const lines: StreamEvent[] = [
    { type: "meta", mode: resolveMode(), model: null },
    event,
    { type: "done", stopReason: "rejected", totalMs: 0 },
  ];
  return new Response(lines.map((line) => JSON.stringify(line)).join("\n") + "\n", { status, headers: NDJSON });
}

/**
 * POST /api/chat: one customer turn in, a stream of newline-delimited JSON
 * events out (text deltas, tool calls, tool results with state patches,
 * citations, usage). The system prompt, documents, price book and API key
 * never leave the server.
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = crossSiteProblem(request);
  if (crossSite) return json(crossSite.status, crossSite.reason);

  // Cheapest checks first: the limiter runs before any body is read or parsed.
  const rate = await checkRate(clientIp(request.headers));
  if (!rate.ok) {
    return noticeStream(429, {
      type: "notice",
      code: "rate_limited",
      message:
        rate.scope === "day"
          ? "Demo limit reached: you've sent a lot of messages today. Please come back tomorrow."
          : "Demo limit reached: you're sending messages very quickly. Give it a minute and try again.",
    });
  }

  let raw: string | null;
  try {
    raw = await readBodyCapped(request, CAPS.maxBodyBytes);
  } catch {
    return json(400, "Could not read the request.");
  }
  if (raw === null) return json(413, "That request is too large for this demo. Try a smaller photo, or use “Reset demo”.");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, "Request body must be JSON.");
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return json(400, "Request did not match the expected shape.");
  const input = parsed.data;

  // The visitor's clock is only trusted within a day of the server's.
  if (Math.abs(diffDays(input.clock.today, localDayStr(new Date()))) > 1) {
    return json(400, "Your device clock looks wrong. Reload the page and try again.");
  }
  if (input.state.jobs.some((job) => !techById(job.techId))) return json(400, "Unknown technician in state.");
  input.state.lead = { ...input.state.lead, id: LIVE_LEAD_ID, live: true };

  if (input.state.lead.status === "human") {
    return noticeStream(200, { type: "notice", code: "error", message: "A Copperline team member has taken over this chat." });
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: StreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        await runTurn(input, emit, { signal: abort.signal });
      } catch (error) {
        console.error("[penny] turn failed:", error instanceof Error ? error.name : "unknown error");
        emit({ type: "notice", code: "error", message: "Something went wrong on our side. Please try that again." });
        emit({ type: "done", stopReason: "error", totalMs: 0 });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // The client already went away.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, { status: 200, headers: NDJSON });
}
