import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CitationView } from "@/lib/domain/types";
import { DOCS } from "../docs";
import { CAPS } from "../limits";
import { apiToolSpecs } from "../tools";
import { costUsd, supportsFallbacks } from "./cost";
import { SYSTEM_PROMPT, buildMessages } from "./prompt";
import { runToolWithEvents, toolContextFor, type Emit, type Engine, type EngineOptions, type TurnInput } from "./types";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type BetaToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type BetaRawMessageStreamEvent = Anthropic.Beta.Messages.BetaRawMessageStreamEvent;
type BetaCitationsDelta = Anthropic.Beta.Messages.BetaCitationsDelta;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** The slice of the SDK the engine uses. Tests pass a stub with this shape. */
export interface MessagesClient {
  beta: {
    messages: {
      stream(
        params: StreamParams,
        options?: { signal?: AbortSignal },
      ): AsyncIterable<BetaRawMessageStreamEvent> & { finalMessage(): Promise<BetaMessage> };
    };
  };
}

export interface LiveConfig {
  client: MessagesClient;
  model: string;
  effort: Effort;
  maxTokens: number;
  maxSteps: number;
  /** Dev-only usage logging, so the X-ray numbers can be checked. */
  log?: (line: string) => void;
  /** Called with each step's estimated cost, for the daily budget. */
  onStepCost?: (usd: number) => void;
}

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** Tools whose result the customer never waits on. */
const BACKGROUND_TOOLS = new Set(["update_lead"]);

export function liveConfigFromEnv(client: MessagesClient): LiveConfig {
  const effort = (process.env.ANTHROPIC_EFFORT ?? "low") as Effort;
  return {
    client,
    model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5",
    effort: EFFORTS.includes(effort) ? effort : "low",
    maxTokens: CAPS.maxTokensPerStep,
    maxSteps: CAPS.maxToolSteps,
    log: process.env.NODE_ENV === "development" ? (line) => console.log(line) : undefined,
  };
}

/** Raised when the API fails before Penny has said anything this turn. */
export class LiveUnavailableError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "LiveUnavailableError";
  }
}

function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "The demo's API key was rejected.";
  if (error instanceof Anthropic.PermissionDeniedError) return "The demo's API key does not have access to this model.";
  if (error instanceof Anthropic.NotFoundError) return "The configured model was not found.";
  if (error instanceof Anthropic.RateLimitError) return "The AI service is busy right now.";
  if (error instanceof Anthropic.BadRequestError) return "The AI service rejected the request.";
  if (error instanceof Anthropic.APIConnectionError) return "The AI service could not be reached.";
  if (error instanceof Anthropic.APIError) return "The AI service returned an error.";
  return "Something went wrong while generating a reply.";
}

/**
 * After a server-side refusal fallback, thinking and tool_use blocks that come
 * before the last `fallback` block must not be sent back; text stays.
 */
export function echoableContent(content: BetaContentBlock[]): BetaContentBlock[] {
  let boundary = -1;
  content.forEach((block, index) => {
    if (block.type === "fallback") boundary = index;
  });
  if (boundary < 0) return content;
  return content.filter((block, index) => {
    if (index >= boundary) return true;
    return block.type !== "thinking" && block.type !== "redacted_thinking" && block.type !== "tool_use";
  });
}

function toCitation(citation: BetaCitationsDelta["citation"]): CitationView | null {
  if (citation.type !== "char_location") return null;
  const doc = DOCS[citation.document_index];
  if (!doc) return null;
  return {
    docId: doc.id,
    docTitle: doc.title,
    quote: citation.cited_text,
    start: citation.start_char_index,
    end: citation.end_char_index,
  };
}

/**
 * The live engine: a streaming tool loop on the Claude Messages API.
 *
 *  - tools use strict schemas and are validated again with zod before running;
 *  - the company documents are document blocks with citations on, cached;
 *  - refusals fall back server-side where the model supports it, and a refusal
 *    that still comes back is turned into a polite message;
 *  - every step reports token usage, cache reads and cost.
 */
export function createLiveEngine(config: LiveConfig): Engine {
  const tools = apiToolSpecs();
  const useFallbacks = supportsFallbacks(config.model);

  return {
    mode: "live",
    async run(input: TurnInput, emit: Emit, options?: EngineOptions) {
      const ctx = toolContextFor(input);
      const messages: MessageParam[] = buildMessages(input);
      let emittedAnything = false;

      for (let step = 1; step <= config.maxSteps; step++) {
        const started = performance.now();
        const params: StreamParams = {
          model: config.model,
          max_tokens: config.maxTokens,
          system: SYSTEM_PROMPT,
          tools,
          messages,
          output_config: { effort: config.effort },
          // Automatic caching for the growing conversation tail; the documents
          // carry their own explicit breakpoint (see prompt.ts).
          cache_control: { type: "ephemeral" },
          ...(useFallbacks
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        };

        let message: BetaMessage;
        try {
          const stream = config.client.beta.messages.stream(params, { signal: options?.signal });
          const pending = new Map<number, CitationView[]>();
          for await (const event of stream) {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                emittedAnything = true;
                emit({ type: "text", text: event.delta.text });
              } else if (event.delta.type === "citations_delta") {
                const citation = toCitation(event.delta.citation);
                if (citation) pending.set(event.index, [...(pending.get(event.index) ?? []), citation]);
              }
            } else if (event.type === "content_block_stop") {
              // Emitted after the block's text, so the chip lands behind the claim.
              for (const citation of pending.get(event.index) ?? []) emit({ type: "citation", citation });
              pending.delete(event.index);
            }
          }
          message = await stream.finalMessage();
        } catch (error) {
          if (options?.signal?.aborted) return { stopReason: "aborted" };
          const userMessage = describeApiError(error);
          // For the server log only: the API's own message says what to fix.
          // It never contains the key, and it is not sent to the browser.
          const detail =
            error instanceof Anthropic.APIError
              ? `${error.name} ${error.status ?? ""}: ${String(error.message).slice(0, 400)}`
              : error instanceof Error
                ? error.name
                : "unknown error";
          if (!emittedAnything) throw new LiveUnavailableError(detail, userMessage);
          emit({ type: "notice", code: "error", message: `${userMessage} Please try that again.` });
          return { stopReason: "error" };
        }

        const usage = {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        };
        const ms = Math.round(performance.now() - started);
        const stepCost = costUsd(message.model, usage) ?? costUsd(config.model, usage);
        emit({ type: "usage", usage: { step, model: message.model, ...usage, costUsd: stepCost, ms } });
        // A model missing from the price table is budgeted at the default model's rates.
        config.onStepCost?.(stepCost ?? costUsd("claude-opus-5-5", usage) ?? 0);
        config.log?.(
          `[penny] step ${step} ${message.model} in=${usage.inputTokens} cache_read=${usage.cacheReadTokens} cache_write=${usage.cacheWriteTokens} out=${usage.outputTokens} ${ms}ms stop=${message.stop_reason}`,
        );

        // Always branch on stop_reason before trusting the content.
        if (message.stop_reason === "refusal") {
          emit({
            type: "notice",
            code: "refusal",
            message: "I can't help with that one. I'm happy to help with a plumbing, heating or cooling question, though.",
          });
          return { stopReason: "refusal" };
        }

        const toolUses = message.content.filter((block): block is BetaToolUseBlock => block.type === "tool_use");
        if (toolUses.length === 0) return { stopReason: message.stop_reason ?? "end_turn" };

        if (message.stop_reason === "max_tokens") {
          // A tool input cut off mid-way can still parse; never run it.
          emit({ type: "notice", code: "error", message: "That reply got cut short. Please try again." });
          return { stopReason: "max_tokens" };
        }

        messages.push({ role: "assistant", content: echoableContent(message.content) });
        const results: BetaToolResultBlockParam[] = toolUses.map((use) => {
          emittedAnything = true;
          const outcome = runToolWithEvents(use.name, use.input, ctx, emit, use.id);
          return {
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(outcome.output),
            ...(outcome.isError ? { is_error: true } : {}),
          };
        });
        // All results go back in one user message so parallel calls keep working.
        messages.push({ role: "user", content: results });

        // A reply that only also filed a background note is already complete:
        // asking the model to speak again would cost a round trip and tempt it
        // to repeat itself. The note's result is replayed in the next turn's history.
        const wroteReply = message.content.some((block) => block.type === "text" && block.text.trim().length > 0);
        if (wroteReply && toolUses.every((use) => BACKGROUND_TOOLS.has(use.name))) return { stopReason: "end_turn" };
      }

      emit({ type: "notice", code: "error", message: "That took more steps than this demo allows. Please try again." });
      return { stopReason: "step_cap" };
    },
  };
}

export function createAnthropicClient(): MessagesClient {
  // Reads ANTHROPIC_API_KEY from the environment. The key never leaves the server.
  // A key that is not tied to one workspace must say which workspace to use;
  // ANTHROPIC_WORKSPACE_ID supplies that. Workspace-scoped keys do not need it.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const client = workspace ? new Anthropic({ defaultHeaders: { "anthropic-workspace-id": workspace } }) : new Anthropic();
  return client as unknown as MessagesClient;
}
