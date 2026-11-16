import type {
  Card,
  CitationView,
  NoticeCode,
  Patch,
  StreamEvent,
  UiEvent,
  UsageView,
  WireImage,
  WireMessage,
} from "./types";

/**
 * The chat transcript as the browser keeps it, and the pure reducer that folds
 * stream events into an assistant turn. Shared by the client store, the test
 * driver and the eval harness, so all three see exactly the same thing.
 */

export interface PlacedCitation extends CitationView {
  /** Character offset in the text part where the chip is shown. */
  at: number;
}

export type AssistantPart =
  | { type: "text"; text: string; citations: PlacedCitation[] }
  | {
      type: "tool";
      id: string;
      name: string;
      input: unknown;
      output: unknown;
      card: Card | null;
      isError: boolean;
      ms: number;
      done: boolean;
    };

export interface TurnNotice {
  code: NoticeCode;
  message: string;
}

export interface AssistantTurn {
  parts: AssistantPart[];
  usage: UsageView[];
  notices: TurnNotice[];
  mode: "live" | "replay" | null;
  model: string | null;
  stopReason: string | null;
  totalMs: number | null;
}

export function emptyTurn(): AssistantTurn {
  return { parts: [], usage: [], notices: [], mode: null, model: null, stopReason: null, totalMs: null };
}

/** Folds one stream event into the turn. Returns the patches to apply, if any. */
export function foldEvent(turn: AssistantTurn, event: StreamEvent): { turn: AssistantTurn; patches: Patch[] } {
  switch (event.type) {
    case "meta":
      return { turn: { ...turn, mode: event.mode, model: event.model }, patches: [] };
    case "text": {
      const parts = [...turn.parts];
      const last = parts[parts.length - 1];
      if (last && last.type === "text") parts[parts.length - 1] = { ...last, text: last.text + event.text };
      else parts.push({ type: "text", text: event.text, citations: [] });
      return { turn: { ...turn, parts }, patches: [] };
    }
    case "citation": {
      const parts = [...turn.parts];
      const last = parts[parts.length - 1];
      if (last && last.type === "text") {
        const at = Math.max(0, last.text.length - Math.max(0, event.back ?? 0));
        const duplicate = last.citations.some((c) => c.docId === event.citation.docId && c.start === event.citation.start && c.at === at);
        if (!duplicate) {
          parts[parts.length - 1] = {
            ...last,
            citations: [...last.citations, { ...event.citation, at }],
          };
        }
      } else {
        parts.push({ type: "text", text: "", citations: [{ ...event.citation, at: 0 }] });
      }
      return { turn: { ...turn, parts }, patches: [] };
    }
    case "tool_call":
      return {
        turn: {
          ...turn,
          parts: [
            ...turn.parts,
            { type: "tool", id: event.id, name: event.name, input: event.input, output: null, card: null, isError: false, ms: 0, done: false },
          ],
        },
        patches: [],
      };
    case "tool_result":
      return {
        turn: {
          ...turn,
          parts: turn.parts.map((part) =>
            part.type === "tool" && part.id === event.id
              ? { ...part, output: event.output, card: event.card, isError: event.isError, ms: event.ms, done: true }
              : part,
          ),
        },
        patches: event.patches,
      };
    case "usage":
      return { turn: { ...turn, usage: [...turn.usage, event.usage] }, patches: [] };
    case "notice":
      return { turn: { ...turn, notices: [...turn.notices, { code: event.code, message: event.message }] }, patches: [] };
    case "done":
      return { turn: { ...turn, stopReason: event.stopReason, totalMs: event.totalMs }, patches: [] };
  }
}

export function turnText(turn: AssistantTurn): string {
  return turn.parts
    .filter((part): part is Extract<AssistantPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
}

export function turnTools(turn: AssistantTurn): Array<Extract<AssistantPart, { type: "tool" }>> {
  return turn.parts.filter((part): part is Extract<AssistantPart, { type: "tool" }> => part.type === "tool");
}

export function turnCitations(turn: AssistantTurn): PlacedCitation[] {
  return turn.parts.flatMap((part) => (part.type === "text" ? part.citations : []));
}

/* ------------------------------------------------------------------ */
/* Transcript                                                          */
/* ------------------------------------------------------------------ */

export type ChatImage =
  | { kind: "sample"; sampleId: string }
  /** `uploadId` keys the full-size data kept in memory only. */
  | { kind: "upload"; uploadId: string; thumb: string };

export type ChatMessage =
  | { id: string; role: "user"; text: string; sentAt: string; atMin: number; image: ChatImage | null }
  | { id: string; role: "assistant"; turn: AssistantTurn; atMin: number; streaming: boolean; responseMs: number | null }
  | { id: string; role: "staff"; text: string; name: string; atMin: number }
  | { id: string; role: "event"; event: UiEvent; sentAt: string; atMin: number }
  | { id: string; role: "system"; text: string; tone: "info" | "limit" | "join"; atMin: number };

export interface UploadData {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  dataBase64: string;
}

/** Converts the browser transcript to what /api/chat expects. */
export function toWire(messages: ChatMessage[], uploads: Record<string, UploadData>): WireMessage[] {
  const wire: WireMessage[] = [];
  // A message the server refused (too long, unreadable photo, rate limit) is
  // not part of the conversation: it must not ride along on later turns.
  const refused = new Set<string>();
  messages.forEach((message, i) => {
    const next = messages[i + 1];
    if ((message.role === "user" || message.role === "event") && next?.role === "assistant" && next.turn.stopReason === "rejected") refused.add(message.id);
  });
  for (const message of messages) {
    if (refused.has(message.id)) continue;
    switch (message.role) {
      case "user": {
        let image: WireImage | null = null;
        if (message.image?.kind === "sample") image = { kind: "sample", sampleId: message.image.sampleId };
        else if (message.image?.kind === "upload") {
          const data = uploads[message.image.uploadId];
          image = data ? { kind: "upload", mediaType: data.mediaType, dataBase64: data.dataBase64 } : { kind: "gone" };
        }
        wire.push({ role: "user", text: message.text, sentAt: message.sentAt, image });
        break;
      }
      case "assistant": {
        const text = turnText(message.turn);
        const tools = turnTools(message.turn)
          .filter((tool) => tool.done)
          .map((tool) => ({ id: tool.id, name: tool.name, input: tool.input, output: tool.output, isError: tool.isError }));
        if (text || tools.length > 0) wire.push({ role: "assistant", text, tools });
        break;
      }
      case "staff":
        wire.push({ role: "staff", text: message.text, name: message.name });
        break;
      case "event":
        wire.push({ role: "event", sentAt: message.sentAt, event: message.event });
        break;
      case "system":
        break; // UI-only lines ("Sam joined the chat") are not part of the transcript.
    }
  }
  return wire;
}
