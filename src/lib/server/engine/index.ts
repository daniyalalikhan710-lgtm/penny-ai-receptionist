import type { NoticeCode, StreamEvent, WireMessage } from "@/lib/domain/types";
import { CAPS, takeLiveTurn } from "../limits";
import { LiveUnavailableError, createAnthropicClient, createLiveEngine, liveConfigFromEnv, type MessagesClient } from "./live";
import { createReplayEngine } from "./replay";
import type { Emit, Engine, EngineOptions, TurnInput } from "./types";

export type PennyMode = "live" | "replay";

/** Live whenever a key is present, unless PENNY_MODE=replay forces the scripts. */
export function resolveMode(env: NodeJS.ProcessEnv = process.env): PennyMode {
  if (env.PENNY_MODE?.toLowerCase() === "replay") return "replay";
  return env.ANTHROPIC_API_KEY?.trim() ? "live" : "replay";
}

export function configuredModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
}

export interface Rejection {
  code: NoticeCode;
  message: string;
}

const MAGIC: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
};

function uploadProblem(message: Extract<WireMessage, { role: "user" }>): string | null {
  const image = message.image;
  if (!image || image.kind !== "upload") return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.dataBase64)) return "That file could not be read as an image.";
  const bytes = Math.floor((image.dataBase64.length * 3) / 4);
  if (bytes > CAPS.maxImageBytes) return "That photo is too large for this demo. Try a smaller one.";
  const head = Buffer.from(image.dataBase64.slice(0, 24), "base64");
  if (!MAGIC[image.mediaType]?.(head)) return "That file doesn't look like a JPEG, PNG or WebP photo.";
  return null;
}

function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Size of everything in the transcript that becomes prompt text. */
export function transcriptChars(messages: WireMessage[]): number {
  let total = 0;
  for (const message of messages) {
    if (message.role === "user" || message.role === "staff") total += message.text.length;
    else if (message.role === "assistant") total += message.text.length + jsonLength(message.tools);
    else total += jsonLength(message.event);
  }
  return total;
}

/**
 * Server-side caps, checked before any engine runs. Each failure becomes a
 * friendly "demo limit" notice in the chat rather than an error.
 */
export function checkCaps(input: TurnInput): Rejection | null {
  const messages = input.messages;
  const last = messages[messages.length - 1];
  if (last.role !== "user" && last.role !== "event") {
    return { code: "error", message: "There is nothing new to reply to." };
  }
  const customerTurns = messages.filter((m) => m.role === "user" || m.role === "event").length;
  if (customerTurns > CAPS.maxUserTurns) {
    return {
      code: "message_cap",
      message: `Demo limit reached: this conversation has hit ${CAPS.maxUserTurns} messages. Use “Reset demo” to start a fresh one.`,
    };
  }
  // Every customer message is held to the cap, not just the newest one: the
  // history comes from the client and all of it reaches the model.
  if (messages.some((m) => m !== last && m.role === "user" && m.text.length > CAPS.maxMessageChars)) {
    return { code: "too_long", message: "An earlier message in this conversation is too long for this demo. Use “Reset demo” to start again." };
  }
  if (transcriptChars(messages) > CAPS.maxTranscriptChars) {
    return {
      code: "message_cap",
      message: "Demo limit reached: this conversation has grown too long. Use “Reset demo” to start a fresh one.",
    };
  }
  if (last.role === "user") {
    if (last.text.length > CAPS.maxMessageChars) {
      return {
        code: "too_long",
        message: `That message is longer than this demo accepts (${CAPS.maxMessageChars.toLocaleString("en-US")} characters). Could you give me the short version?`,
      };
    }
    if (!last.text.trim() && !last.image) return { code: "error", message: "That message was empty." };
    const images = messages.filter((m) => m.role === "user" && m.image).length;
    if (last.image && images > CAPS.maxImagesPerConversation) {
      return {
        code: "image_cap",
        message: `Demo limit reached: ${CAPS.maxImagesPerConversation} photos per conversation. Use “Reset demo” to start again.`,
      };
    }
    const problem = uploadProblem(last);
    if (problem) return { code: "upload_invalid", message: problem };
  }
  // Earlier uploads are re-sent with every turn; make sure none was swapped.
  for (const message of messages) {
    if (message.role === "user" && uploadProblem(message)) {
      return { code: "upload_invalid", message: "One of the photos in this conversation could not be read." };
    }
  }
  return null;
}

export interface RunTurnOptions extends EngineOptions {
  /** Injected in tests and evals; defaults come from the environment. */
  mode?: PennyMode;
  client?: MessagesClient;
  replayPace?: number;
  skipBudget?: boolean;
}

let cachedClient: MessagesClient | null = null;

/**
 * Runs one turn end to end and emits the full event stream, including the
 * leading "meta" and trailing "done" events. This is what /api/chat, the eval
 * harness and the tests all call.
 */
export async function runTurn(input: TurnInput, emit: Emit, options: RunTurnOptions = {}): Promise<{ mode: PennyMode; stopReason: string }> {
  const started = performance.now();
  const finish = (mode: PennyMode, stopReason: string) => {
    emit({ type: "done", stopReason, totalMs: Math.round(performance.now() - started) });
    return { mode, stopReason };
  };

  let mode = options.mode ?? resolveMode();
  const rejection = checkCaps(input);
  if (rejection) {
    emit({ type: "meta", mode, model: mode === "live" ? configuredModel() : null });
    emit({ type: "notice", code: rejection.code, message: rejection.message });
    return finish(mode, "rejected");
  }

  const replay = (): Engine => createReplayEngine(options.replayPace === undefined ? {} : { pace: options.replayPace });

  if (mode === "live" && !options.skipBudget && !(await takeLiveTurn())) {
    mode = "replay";
    emit({ type: "meta", mode, model: null });
    emit({ type: "notice", code: "budget_fallback", message: "Today's live-AI budget for this demo is used up, so Penny is running in replay mode." });
    const result = await replay().run(input, emit, options);
    return finish(mode, result.stopReason);
  }

  if (mode === "replay") {
    emit({ type: "meta", mode, model: null });
    const result = await replay().run(input, emit, options);
    return finish(mode, result.stopReason);
  }

  const client = options.client ?? (cachedClient ??= createAnthropicClient());
  const config = liveConfigFromEnv(client);
  emit({ type: "meta", mode: "live", model: config.model });
  try {
    const result = await createLiveEngine(config).run(input, emit, options);
    return finish("live", result.stopReason);
  } catch (error) {
    if (!(error instanceof LiveUnavailableError)) throw error;
    // Nothing was said yet, so the scripted engine can take this turn instead
    // of the demo breaking: a bad key or exhausted credits degrade gracefully.
    console.error(`[penny] live engine unavailable (${error.message}); falling back to replay`);
    emit({ type: "meta", mode: "replay", model: null });
    emit({ type: "notice", code: "budget_fallback", message: `${error.userMessage} Penny is answering in replay mode for now.` });
    const result = await replay().run(input, emit, options);
    return finish("replay", result.stopReason);
  }
}

export type { StreamEvent };
