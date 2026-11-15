"use client";

import { BookOpen, Camera, ImagePlus, Lightbulb, Minus, SendHorizontal, UserRound, X } from "lucide-react";
import Image from "next/image";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { prepareUpload } from "@/lib/client/image";
import { useDemo } from "@/lib/client/store";
import { turnText, type AssistantPart, type ChatMessage, type PlacedCitation } from "@/lib/domain/chat";
import { SAMPLE_PHOTOS, sampleById } from "@/lib/domain/samples";
import { OWNER } from "@/lib/domain/technicians";
import { fmtTime } from "@/lib/domain/time";
import type { Lang } from "@/lib/domain/types";
import { CardView } from "./cards";
import { PennyAvatar } from "./penny-avatar";

const DOC_LABEL: Record<string, string> = {
  pricing: "Price book",
  "service-area": "Service area",
  warranty: "Warranty",
  "booking-policy": "Booking policy",
  emergency: "Safety guide",
  faq: "FAQ",
  financing: "Financing",
  "care-club": "Care Club",
};

interface Suggestion {
  label: string;
  text: string;
  sampleId?: string;
}

const SUGGESTIONS: Suggestion[] = [
  { label: "My water heater is leaking", text: "My water heater is leaking", sampleId: "water-heater" },
  { label: "I smell gas in my kitchen", text: "I smell gas in my kitchen" },
  { label: "Do you service 97520?", text: "Do you service 97520?" },
  { label: "¿Pueden arreglar mi aire acondicionado mañana?", text: "¿Pueden arreglar mi aire acondicionado mañana?" },
  { label: "What's your warranty on repairs?", text: "What's your warranty on repairs?" },
  { label: "Reschedule my appointment CPL-4821", text: "Reschedule my appointment CPL-4821" },
];

/* ------------------------------ Message parts ------------------------------ */

function CitationChip({ citation }: { citation: PlacedCitation }) {
  const openCitation = useDemo((s) => s.openCitation);
  const label = DOC_LABEL[citation.docId] ?? citation.docTitle;
  return (
    <button
      type="button"
      data-testid="citation-chip"
      onClick={() => openCitation({ docId: citation.docId, start: citation.start, end: citation.end, quote: citation.quote })}
      title={`Source: ${citation.docTitle}`}
      aria-label={`${label}: open the cited passage in ${citation.docTitle}`}
      className="mx-0.5 inline-flex min-h-6 translate-y-[-1px] items-center gap-1 rounded-full border border-copper-200 bg-copper-50 px-1.5 align-middle text-[10.5px] leading-none font-semibold whitespace-nowrap text-copper-800 transition hover:border-copper-400 hover:bg-copper-100"
    >
      <BookOpen className="size-3" aria-hidden />
      {label}
    </button>
  );
}

function TextPart({ part }: { part: Extract<AssistantPart, { type: "text" }> }) {
  const segments = useMemo(() => {
    const sorted = [...part.citations].sort((a, b) => a.at - b.at);
    const out: Array<{ text: string; citations: PlacedCitation[] }> = [];
    let cursor = 0;
    for (const citation of sorted) {
      const at = Math.min(citation.at, part.text.length);
      const last = out[out.length - 1];
      // Several citations at the same spot share one run of text.
      if (last && at === cursor) {
        last.citations.push(citation);
        continue;
      }
      out.push({ text: part.text.slice(cursor, at), citations: [citation] });
      cursor = at;
    }
    if (cursor < part.text.length || out.length === 0) out.push({ text: part.text.slice(cursor), citations: [] });
    return out;
  }, [part]);

  if (!part.text.trim() && part.citations.length === 0) return null;
  return (
    <div className="w-fit max-w-full rounded-2xl rounded-tl-md border border-ink-100 bg-white px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap text-ink-900 shadow-sm">
      {segments.map((segment, i) => (
        <Fragment key={i}>
          {i === 0 ? segment.text.replace(/^\s+/, "") : segment.text}
          {segment.citations.map((citation, j) => (
            <CitationChip key={`${citation.docId}-${citation.start}-${j}`} citation={citation} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-tl-md border border-ink-100 bg-white px-3.5 py-3 shadow-sm" role="status" aria-label="Penny is typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot size-1.5 rounded-full bg-ink-400" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

function AssistantMessage({ message, lang }: { message: Extract<ChatMessage, { role: "assistant" }>; lang: Lang }) {
  const { turn, streaming } = message;
  const visibleNotices = turn.notices.filter((n) => n.code !== "off_script");
  const hasContent = turn.parts.some((p) => (p.type === "text" ? p.text.trim() : p.card));
  const lastPart = turn.parts[turn.parts.length - 1];
  const waiting = streaming && (!hasContent || (lastPart?.type === "tool" && !lastPart.done));
  if (!hasContent && !streaming && visibleNotices.length === 0) return null;

  return (
    <div className="flex items-start gap-2" data-testid="assistant-message">
      <PennyAvatar size={28} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {turn.parts.map((part, i) =>
          part.type === "text" ? (
            <TextPart key={i} part={part} />
          ) : part.card ? (
            <CardView key={part.id} card={part.card} toolId={part.id} lang={lang} />
          ) : null,
        )}
        {waiting && <TypingDots />}
        {visibleNotices.map((notice, i) => (
          <p
            key={i}
            role={notice.code === "error" ? "alert" : "status"}
            data-testid="chat-notice"
            data-code={notice.code}
            className={cn(
              "w-fit max-w-full rounded-xl border px-3 py-2 text-[12.5px] leading-snug",
              notice.code === "budget_fallback"
                ? "border-ink-100 bg-ink-50 text-ink-700"
                : "border-amber-200 bg-amber-50 text-amber-950",
            )}
          >
            {notice.message}
          </p>
        ))}
      </div>
    </div>
  );
}

function UserImage({ message }: { message: Extract<ChatMessage, { role: "user" }> }) {
  if (!message.image) return null;
  if (message.image.kind === "sample") {
    const sample = sampleById(message.image.sampleId);
    if (!sample) return null;
    return (
      <Image
        src={sample.thumb}
        alt={sample.alt}
        width={200}
        height={150}
        className="mb-1 h-[150px] w-[200px] rounded-2xl rounded-br-md border border-ink-100 object-cover shadow-sm"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URL thumbnail from the visitor's own upload
    <img
      src={message.image.thumb}
      alt="Photo you uploaded"
      className="mb-1 max-h-[150px] max-w-[200px] rounded-2xl rounded-br-md border border-ink-100 object-cover shadow-sm"
    />
  );
}

function MessageRow({ message, lang }: { message: ChatMessage; lang: Lang }) {
  switch (message.role) {
    case "user":
      return (
        <div className="flex flex-col items-end" data-testid="user-message">
          <UserImage message={message} />
          {message.text ? (
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink-900 px-3.5 py-2.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap text-cream shadow-sm">
              {message.text}
            </div>
          ) : null}
        </div>
      );
    case "assistant":
      return <AssistantMessage message={message} lang={lang} />;
    case "staff":
      return (
        <div className="flex items-start gap-2" data-testid="staff-message">
          <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-cream">
            {message.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="mb-0.5 text-[11px] font-semibold text-ink-600">
              {message.name} · Copperline team <span className="font-normal text-ink-500">{fmtTime(message.atMin)}</span>
            </p>
            <div className="w-fit max-w-full rounded-2xl rounded-tl-md border border-copper-200 bg-copper-50 px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap text-ink-900 shadow-sm">
              {message.text}
            </div>
          </div>
        </div>
      );
    case "system":
      return (
        <p className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-[11.5px] font-medium text-ink-700" data-testid="system-message">
          {message.tone === "join" ? <UserRound className="size-3.5" aria-hidden /> : null}
          {message.text}
        </p>
      );
    case "event":
      return null; // Taps on cards are shown by the cards themselves.
  }
}

/* --------------------------------- Composer -------------------------------- */

function SampleTray({ onPick, onUpload, onClose }: { onPick: (id: string) => void; onUpload: () => void; onClose: () => void }) {
  return (
    <div className="border-t border-ink-100 bg-cream px-3 py-2.5" data-testid="sample-tray">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-ink-700">Send a photo of the problem</p>
        <button type="button" onClick={onClose} aria-label="Close photo options" className="flex size-6 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="grid grid-cols-3 gap-1.5">
        {SAMPLE_PHOTOS.map((sample) => (
          <li key={sample.id}>
            <button
              type="button"
              data-testid={`sample-${sample.id}`}
              onClick={() => onPick(sample.id)}
              className="group relative block w-full overflow-hidden rounded-lg border border-ink-100 text-left"
            >
              <Image src={sample.thumb} alt={sample.alt} width={160} height={96} className="h-16 w-full object-cover transition group-hover:scale-105" />
              <span className="block truncate bg-white px-1.5 py-1 text-[10.5px] font-medium text-ink-800">{sample.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onUpload}
        className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-300 text-[12.5px] font-semibold text-ink-700 hover:bg-white"
      >
        <ImagePlus className="size-4" aria-hidden /> Upload your own photo
      </button>
      <p className="mt-1.5 text-[10.5px] leading-snug text-ink-500">Sample photos from Unsplash. Uploads stay in your browser and are only sent to the AI to assess the problem.</p>
    </div>
  );
}

function Composer({ empty }: { empty: boolean }) {
  const sending = useDemo((s) => s.sending);
  const sendUser = useDemo((s) => s.sendUser);
  const paused = useDemo((s) => s.lead.status === "human");
  const [text, setText] = useState("");
  const [tray, setTray] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ id: string; thumb: string; data: Awaited<ReturnType<typeof prepareUpload>>["data"] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 112)}px`;
  }, [text]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (sending || (!value && !pendingUpload)) return;
    setText("");
    setShowTips(false);
    if (pendingUpload) {
      const upload = pendingUpload;
      setPendingUpload(null);
      void sendUser(value, { kind: "upload", uploadId: upload.id, thumb: upload.thumb }, { id: upload.id, data: upload.data });
    } else {
      void sendUser(value);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const sendSuggestion = (s: Suggestion) => {
    if (sending) return;
    setShowTips(false);
    setTray(false);
    void sendUser(s.text, s.sampleId ? { kind: "sample", sampleId: s.sampleId } : null);
  };

  const pickSample = (id: string) => {
    const sample = sampleById(id);
    if (!sample || sending) return;
    setTray(false);
    void sendUser(sample.prompt, { kind: "sample", sampleId: id });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    try {
      const prepared = await prepareUpload(file);
      setPendingUpload({ id: `up-${Date.now().toString(36)}`, thumb: prepared.thumb, data: prepared.data });
      setTray(false);
      areaRef.current?.focus();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "That photo couldn't be used.");
    }
  };

  const tips = empty || showTips;

  return (
    <div className="shrink-0 border-t border-ink-100 bg-white">
      {tips && !tray && (
        <div className="px-3 pt-2.5" data-testid="suggestions">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{empty ? "Try one of these" : "More to try"}</p>
          <ul className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s, i) => {
              // On a fresh chat the photo prompt is the one to start with.
              const startHere = empty && i === 0;
              return (
                <li key={s.label}>
                  <button
                    type="button"
                    disabled={sending || paused}
                    onClick={() => sendSuggestion(s)}
                    className={cn(
                      "flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-left text-[12.5px] leading-snug font-medium text-ink-800 transition hover:border-copper-400 hover:bg-copper-50 disabled:opacity-50",
                      startHere ? "border-copper-500 bg-copper-50 shadow-[0_0_0_3px_rgb(184_115_51/0.18)]" : "border-ink-200 bg-cream",
                    )}
                  >
                    {s.sampleId ? <Camera className="size-3.5 shrink-0 text-copper-600" aria-label="With a sample photo:" /> : null}
                    {s.label}
                    {startHere ? <span className="rounded-full bg-copper-600 px-1.5 py-px text-[9.5px] font-bold tracking-wide text-white uppercase">Start here</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {tray && <SampleTray onPick={pickSample} onUpload={() => fileRef.current?.click()} onClose={() => setTray(false)} />}
      {uploadError && (
        <p role="alert" className="mx-3 mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12px] font-medium text-red-800">
          {uploadError}
        </p>
      )}
      {pendingUpload && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-ink-100 bg-ink-50 p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL preview of the visitor's upload */}
          <img src={pendingUpload.thumb} alt="Photo ready to send" className="size-10 rounded-md object-cover" />
          <p className="min-w-0 flex-1 text-[12px] text-ink-700">Photo attached. Add a note or press send.</p>
          <button type="button" onClick={() => setPendingUpload(null)} aria-label="Remove photo" className="flex size-7 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
      <form onSubmit={submit} className="flex items-end gap-1.5 p-2.5">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <button
          type="button"
          data-testid="photo-button"
          onClick={() => setTray((v) => !v)}
          aria-expanded={tray}
          aria-label="Send a photo"
          title="Send a photo"
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-600 transition hover:bg-ink-100", tray && "bg-copper-100 text-copper-800")}
        >
          <Camera className="size-5" aria-hidden />
        </button>
        {!empty && (
          <button
            type="button"
            onClick={() => setShowTips((v) => !v)}
            aria-expanded={showTips}
            aria-label="Show suggested prompts"
            title="Suggested prompts"
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-600 transition hover:bg-ink-100", showTips && "bg-copper-100 text-copper-800")}
          >
            <Lightbulb className="size-5" aria-hidden />
          </button>
        )}
        <label htmlFor="penny-input" className="sr-only">
          Message Penny
        </label>
        <textarea
          id="penny-input"
          ref={areaRef}
          data-testid="chat-input"
          rows={1}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={paused ? `Reply to ${OWNER.name}…` : "Describe the problem…"}
          enterKeyHint="send"
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-ink-200 bg-white px-3 py-2 text-[14px] leading-snug text-ink-900 placeholder:text-ink-500"
        />
        <button
          type="submit"
          data-testid="send-button"
          disabled={sending || (!text.trim() && !pendingUpload)}
          aria-label="Send message"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-copper-600 text-white transition hover:bg-copper-700 disabled:bg-ink-200 disabled:text-ink-400"
        >
          <SendHorizontal className="size-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}

/* ---------------------------------- Widget --------------------------------- */

export function ChatWidget({ onMinimize }: { onMinimize?: () => void }) {
  const messages = useDemo((s) => s.messages);
  const lang = useDemo((s) => s.lead.language);
  const mode = useDemo((s) => s.mode);
  const status = useDemo((s) => s.lead.status);
  const sending = useDemo((s) => s.sending);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const empty = messages.length === 0;
  const last = messages[messages.length - 1];

  // Keep the newest content in view unless the visitor has scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  // Screen readers hear each finished reply once, not every streamed token.
  const announcement = useMemo(() => {
    if (!last) return "";
    if (last.role === "assistant" && !last.streaming) {
      const text = turnText(last.turn);
      const cards = last.turn.parts.filter((p) => p.type === "tool" && p.card).length;
      return `Penny: ${text}${cards ? ` (${cards} card${cards > 1 ? "s" : ""} shown)` : ""}`;
    }
    if (last.role === "staff") return `${last.name} from Copperline: ${last.text}`;
    if (last.role === "system") return last.text;
    return "";
  }, [last]);

  return (
    <section aria-label="Chat with Penny, Copperline's AI receptionist" className="flex h-full min-h-0 flex-col overflow-hidden bg-cream" data-testid="chat-widget" data-busy={sending ? "true" : "false"}>
      <header className="on-dark flex shrink-0 items-center gap-2.5 bg-ink-900 px-3.5 py-2.5 text-cream">
        <PennyAvatar size={36} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] leading-tight font-semibold">
            Penny
            {mode === "replay" && (
              <span
                data-testid="replay-pill"
                title="No API key is configured, so Penny is running scripted conversations. The tools, prices, calendar and dashboard are all real."
                className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-copper-200 uppercase ring-1 ring-white/20"
              >
                Replay mode
              </span>
            )}
          </h2>
          <p className="flex items-center gap-1.5 text-[12px] text-ink-200">
            <span className={cn("size-1.5 rounded-full", status === "human" ? "bg-copper-300" : "bg-emerald-400")} aria-hidden />
            {status === "human" ? `${OWNER.name} from Copperline is in this chat` : "AI receptionist · Copperline Plumbing & Heating"}
          </p>
        </div>
        {onMinimize && (
          <button type="button" onClick={onMinimize} aria-label="Minimize chat" className="flex size-8 items-center justify-center rounded-lg text-ink-200 hover:bg-white/10">
            <Minus className="size-5" aria-hidden />
          </button>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3"
        tabIndex={0}
        aria-label="Conversation"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <PennyAvatar size={28} className="mt-0.5" />
            <div className="w-fit max-w-full rounded-2xl rounded-tl-md border border-ink-100 bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-900 shadow-sm">
              Hi, I&rsquo;m Penny, Copperline&rsquo;s AI receptionist. Tell me what&rsquo;s going on, or send a photo, and I&rsquo;ll give you a price range and the earliest time we can come out.
            </div>
          </div>
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} lang={lang} />
          ))}
          {sending && last?.role !== "assistant" ? (
            <div className="flex items-start gap-2">
              <PennyAvatar size={28} className="mt-0.5" />
              <TypingDots />
            </div>
          ) : null}
        </div>
      </div>

      <Composer empty={empty} />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
