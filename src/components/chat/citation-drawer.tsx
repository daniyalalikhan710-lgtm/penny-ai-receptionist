"use client";

import { BookOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDemo } from "@/lib/client/store";

interface Doc {
  id: string;
  title: string;
  text: string;
}

const cache = new Map<string, Doc>();

interface Line {
  text: string;
  start: number;
  kind: "h1" | "h2" | "bullet" | "p" | "blank";
}

function toLines(text: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  for (const raw of text.split("\n")) {
    const kind: Line["kind"] = raw.startsWith("# ") ? "h1" : raw.startsWith("## ") ? "h2" : raw.startsWith("- ") ? "bullet" : raw.trim() === "" ? "blank" : "p";
    lines.push({ text: raw, start: offset, kind });
    offset += raw.length + 1;
  }
  return lines;
}

/** Renders one line, wrapping the cited character range in a <mark>. */
function LineText({ line, start, end, markRef }: { line: Line; start: number; end: number; markRef: React.RefObject<HTMLElement | null> }) {
  const prefix = line.kind === "h1" ? 2 : line.kind === "h2" ? 3 : line.kind === "bullet" ? 2 : 0;
  const visible = line.text.slice(prefix);
  const from = Math.max(0, start - line.start - prefix);
  const to = Math.min(visible.length, end - line.start - prefix);
  if (to <= from || to <= 0 || from >= visible.length) return <>{visible}</>;
  return (
    <>
      {visible.slice(0, from)}
      <mark ref={markRef} data-testid="citation-highlight" className="rounded bg-copper-200 px-0.5 py-0.5 text-ink-950 ring-1 ring-copper-400">
        {visible.slice(from, to)}
      </mark>
      {visible.slice(to)}
    </>
  );
}

/**
 * Shows the source document with the cited passage highlighted. The text and
 * the character range both come straight from the citation, so what is
 * highlighted is exactly what the answer was grounded in.
 */
export function CitationDrawer() {
  const citation = useDemo((s) => s.citation);
  const openCitation = useDemo((s) => s.openCitation);
  const [fetched, setFetched] = useState<Doc | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const markRef = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const docId = citation?.docId ?? null;
  const doc = docId ? (cache.get(docId) ?? (fetched?.id === docId ? fetched : null)) : null;
  const error = Boolean(docId) && failedId === docId && !doc;

  useEffect(() => {
    if (!docId || cache.has(docId)) return;
    let cancelled = false;
    fetch(`/api/docs/${encodeURIComponent(docId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<Doc>) : Promise.reject(new Error("not ok"))))
      .then((loaded) => {
        cache.set(loaded.id, loaded);
        if (!cancelled) {
          setFetched(loaded);
          setFailedId(null);
        }
      })
      .catch(() => {
        if (!cancelled) setFailedId(docId);
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  useEffect(() => {
    if (!doc || !citation) return;
    const timer = window.setTimeout(() => markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
    return () => window.clearTimeout(timer);
  }, [doc, citation]);

  const lines = doc ? toLines(doc.text) : [];
  let firstMarkAssigned = false;

  return (
    <Sheet open={Boolean(citation)} onOpenChange={(open) => !open && openCitation(null)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-cream p-0 sm:max-w-md"
        data-testid="citation-drawer"
        onOpenAutoFocus={() => {
          // Opened from a chip in the chat, not a Radix trigger: remember it so
          // focus can go back there when the drawer closes.
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (opener.current?.isConnected) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
      >
        <SheetHeader className="border-b border-ink-100 bg-white px-5 py-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-copper-700 uppercase">
            <BookOpen className="size-3.5" aria-hidden /> Source document
          </p>
          <SheetTitle className="font-display text-xl text-ink-900">{doc ? doc.title : error ? "Document unavailable" : "Loading…"}</SheetTitle>
          <SheetDescription className="text-[12.5px] text-ink-600">
            Penny answered from this Copperline document. The passage she cited is highlighted.
          </SheetDescription>
        </SheetHeader>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4" tabIndex={0} role="region" aria-label="Document text">
          {error && <p role="alert" className="text-sm text-red-800">This document couldn&rsquo;t be loaded. Please try again.</p>}
          {!error && lines.length === 0 && (
            <div className="space-y-2" aria-hidden>
              {[90, 100, 75, 95, 60].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-ink-100" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
          {citation &&
            lines.map((line, i) => {
              const lineEnd = line.start + line.text.length;
              const overlaps = citation.start < lineEnd && citation.end > line.start;
              const ref = overlaps && !firstMarkAssigned ? markRef : { current: null };
              if (overlaps) firstMarkAssigned = true;
              const content = <LineText line={line} start={citation.start} end={citation.end} markRef={ref} />;
              if (line.kind === "blank") return <div key={i} className="h-2" />;
              if (line.kind === "h1") return null; // The sheet title already shows it.
              if (line.kind === "h2")
                return (
                  <h3 key={i} className="mt-3 mb-1 font-display text-[15px] font-semibold text-ink-900">
                    {content}
                  </h3>
                );
              if (line.kind === "bullet")
                return (
                  <p key={i} className="relative mb-1 pl-4 text-[13.5px] leading-relaxed text-ink-800 before:absolute before:top-[0.6em] before:left-1 before:size-1 before:rounded-full before:bg-copper-500">
                    {content}
                  </p>
                );
              return (
                <p key={i} className="mb-1 text-[13.5px] leading-relaxed text-ink-800">
                  {content}
                </p>
              );
            })}
        </div>
        <p className="border-t border-ink-100 bg-white px-5 py-3 text-[11.5px] leading-snug text-ink-500">
          Copperline is a fictional business. These documents were written for this demo.
        </p>
      </SheetContent>
    </Sheet>
  );
}
