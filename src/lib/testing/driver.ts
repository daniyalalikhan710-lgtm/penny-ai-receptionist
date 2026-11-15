import { emptyTurn, foldEvent, toWire, turnCitations, turnText, turnTools, type AssistantTurn, type ChatImage, type ChatMessage, type UploadData } from "@/lib/domain/chat";
import { applyPatches, type PatchableState } from "@/lib/domain/patches";
import { freshLiveLead, seedJobs } from "@/lib/domain/seed";
import { fmtStamp } from "@/lib/domain/time";
import type { Card, Clock, StreamEvent, UiEvent } from "@/lib/domain/types";
import { runTurn, type RunTurnOptions } from "@/lib/server/engine";
import { confirmPayment } from "@/lib/server/tools";

/**
 * Drives a whole conversation against the engine the way the browser does:
 * keeps the transcript and sandbox, applies state patches, and can tap slots,
 * submit the details form and pay. Used by unit tests and the eval harness.
 */
export class DemoDriver {
  clock: Clock;
  state: PatchableState;
  messages: ChatMessage[] = [];
  uploads: Record<string, UploadData> = {};
  turns: AssistantTurn[] = [];
  private counter = 0;

  constructor(
    clock: Clock = { today: "2026-11-17", nowMinutes: 630, tz: "America/Los_Angeles" },
    private readonly options: RunTurnOptions = { mode: "replay", replayPace: 0, skipBudget: true },
  ) {
    this.clock = clock;
    this.state = { jobs: seedJobs(clock), lead: freshLiveLead(clock), outbox: [], alerts: [] };
  }

  private id(): string {
    this.counter += 1;
    return `m${this.counter}`;
  }

  get last(): AssistantTurn {
    return this.turns[this.turns.length - 1] ?? emptyTurn();
  }

  get lastText(): string {
    return turnText(this.last);
  }

  toolNames(turn: AssistantTurn = this.last): string[] {
    return turnTools(turn).map((tool) => tool.name);
  }

  tool(name: string, turn: AssistantTurn = this.last) {
    return turnTools(turn).find((tool) => tool.name === name);
  }

  cards(turn: AssistantTurn = this.last): Card[] {
    return turnTools(turn).flatMap((tool) => (tool.card ? [tool.card] : []));
  }

  card<K extends Card["kind"]>(kind: K, turn: AssistantTurn = this.last): Extract<Card, { kind: K }> | undefined {
    return this.cards(turn).find((card): card is Extract<Card, { kind: K }> => card.kind === kind);
  }

  citedDocs(turn: AssistantTurn = this.last): string[] {
    return [...new Set(turnCitations(turn).map((c) => c.docId))];
  }

  /** Every tool call made in the conversation so far. */
  allToolNames(): string[] {
    return this.turns.flatMap((turn) => this.toolNames(turn));
  }

  private async run(): Promise<AssistantTurn> {
    let turn = emptyTurn();
    const emit = (event: StreamEvent) => {
      const folded = foldEvent(turn, event);
      turn = folded.turn;
      if (folded.patches.length > 0) this.state = applyPatches(this.state, folded.patches);
    };
    await runTurn(
      { messages: toWire(this.messages, this.uploads), state: { jobs: this.state.jobs, lead: this.state.lead }, clock: this.clock },
      emit,
      this.options,
    );
    this.messages.push({ id: this.id(), role: "assistant", turn, atMin: this.clock.nowMinutes, streaming: false, responseMs: turn.totalMs });
    this.turns.push(turn);
    return turn;
  }

  async send(text: string, image: ChatImage | null = null): Promise<AssistantTurn> {
    this.messages.push({ id: this.id(), role: "user", text, sentAt: fmtStamp(this.clock), atMin: this.clock.nowMinutes, image });
    return this.run();
  }

  async sendSample(text: string, sampleId: string): Promise<AssistantTurn> {
    return this.send(text, { kind: "sample", sampleId });
  }

  async sendUpload(text: string, data: UploadData): Promise<AssistantTurn> {
    const uploadId = this.id();
    this.uploads[uploadId] = data;
    return this.send(text, { kind: "upload", uploadId, thumb: "" });
  }

  async event(event: UiEvent): Promise<AssistantTurn> {
    this.messages.push({ id: this.id(), role: "event", event, sentAt: fmtStamp(this.clock), atMin: this.clock.nowMinutes });
    return this.run();
  }

  /** Owner takes over, types a reply, and hands back. */
  staffSays(text: string, name = "Sam"): void {
    this.messages.push({ id: this.id(), role: "staff", text, name, atMin: this.clock.nowMinutes });
  }

  /** What /api/pay does, without HTTP. */
  pay(bookingCode: string, cardNumber = "4242 4242 4242 4242"): { ok: boolean; reason?: string } {
    const ctx = { state: this.state, clock: this.clock, photo: null };
    const result = confirmPayment(bookingCode, cardNumber, ctx);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.state = applyPatches(this.state, result.patches);
    return { ok: true };
  }

  job(code: string) {
    return this.state.jobs.find((job) => job.code === code);
  }
}
