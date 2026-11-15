import type { PatchableState } from "@/lib/domain/patches";
import type { Clock, Lang, PhotoRef, SandboxState, StreamEvent, WireMessage } from "@/lib/domain/types";
import { executeTool, type ToolContext, type ToolOutcome } from "../tools";

/** One customer turn: the transcript so far plus the visitor's sandbox. */
export interface TurnInput {
  messages: WireMessage[];
  state: SandboxState;
  clock: Clock;
}

export type Emit = (event: StreamEvent) => void;

export interface EngineOptions {
  signal?: AbortSignal;
}

/**
 * Both engines implement this. They emit the same event stream (text deltas,
 * tool calls, tool results with state patches, citations, usage), so the UI
 * cannot tell them apart except by the "meta" event.
 */
export interface Engine {
  mode: "live" | "replay";
  run(input: TurnInput, emit: Emit, options?: EngineOptions): Promise<{ stopReason: string }>;
}

export function toolContextFor(input: TurnInput): ToolContext {
  const state: PatchableState = {
    jobs: input.state.jobs,
    lead: input.state.lead,
    outbox: [],
    alerts: [],
  };
  return { state, clock: input.clock, photo: latestPhoto(input.messages) };
}

export function latestPhoto(messages: WireMessage[]): PhotoRef | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user" || !message.image) continue;
    if (message.image.kind === "sample") return { kind: "sample", sampleId: message.image.sampleId };
    return { kind: "upload" };
  }
  return null;
}

let toolCounter = 0;

/** Runs a tool and emits the call/result pair. Shared by both engines. */
export function runToolWithEvents(
  name: string,
  input: unknown,
  ctx: ToolContext,
  emit: Emit,
  id?: string,
): ToolOutcome & { id: string } {
  toolCounter = (toolCounter + 1) % 1_000_000;
  const toolId = id ?? `rp_${Date.now().toString(36)}_${toolCounter}`;
  emit({ type: "tool_call", id: toolId, name, input });
  const started = performance.now();
  const outcome = executeTool(name, input, ctx);
  emit({
    type: "tool_result",
    id: toolId,
    name,
    output: outcome.output,
    card: outcome.card,
    patches: outcome.patches,
    isError: outcome.isError,
    ms: Math.max(1, Math.round(performance.now() - started)),
  });
  return { ...outcome, id: toolId };
}

const SPANISH_MARKERS =
  /[¿¡ñ]|\b(hola|buenas|pueden|puede|podrian|necesito|tengo|quiero|gracias|por favor|mi casa|aire acondicionado|calefaccion|calentador|manana|cuanto|cuesta|huele|fuga|cita|ayuda|arreglar|reparar|esta|baño|bano|cocina|agua)\b/i;

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function detectLang(text: string): Lang {
  return SPANISH_MARKERS.test(stripAccents(text)) || /[¿¡ñáéíóú]/i.test(text) ? "es" : "en";
}
