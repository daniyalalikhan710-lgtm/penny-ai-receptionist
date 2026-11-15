"use client";

import { Columns2, FileText, LayoutDashboard, MessageCircle, MonitorSmartphone, RotateCcw, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/client/hooks";
import { useDemo, type ViewMode } from "@/lib/client/store";
import { ChatWidget } from "../chat/chat-widget";
import { CitationDrawer } from "../chat/citation-drawer";
import { PennyAvatar } from "../chat/penny-avatar";
import { Dashboard } from "../owner/dashboard";
import { CopperlineSite } from "../site/copperline-site";
import { XrayPanel } from "../xray/xray-panel";
import { FlightLayer } from "./flight-layer";

function DemoBanner({ authorName, hireUrl }: { authorName: string; hireUrl: string }) {
  return (
    <aside aria-label="About this demo" className="on-dark flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 bg-ink-950 px-3 py-1.5 text-center text-[11px] leading-tight text-ink-200 sm:text-[11.5px]" data-testid="demo-banner">
      <p>
        <span className="font-semibold text-copper-300">Live demo</span>
        <span aria-hidden> · </span>Copperline is a fictional business<span aria-hidden> · </span>No real payments<span className="max-sm:hidden"> or messages</span>
      </p>
      {authorName ? (
        <p className="text-ink-300">
          Built by <span className="font-semibold text-cream">{authorName}</span>
          {hireUrl ? (
            <>
              <span aria-hidden> · </span>
              <a href={hireUrl} target="_blank" rel="noreferrer" className="font-semibold text-copper-300 underline underline-offset-2 hover:text-copper-200" data-testid="hire-link">
                Hire me
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </aside>
  );
}

const VIEWS: Array<{ id: ViewMode; label: string; icon: typeof Columns2; desktopOnly?: boolean }> = [
  { id: "split", label: "Split", icon: Columns2, desktopOnly: true },
  { id: "customer", label: "Customer", icon: MessageCircle },
  { id: "owner", label: "Owner", icon: LayoutDashboard },
];

function TopBar({ wide, view }: { wide: boolean; view: ViewMode }) {
  const setView = useDemo((s) => s.setView);
  const xray = useDemo((s) => s.xray);
  const setXray = useDemo((s) => s.setXray);
  const reset = useDemo((s) => s.reset);
  const mode = useDemo((s) => s.mode);
  const model = useDemo((s) => s.model);
  const hasAlert = useDemo((s) => s.alerts.some((a) => !a.acknowledged));
  const ownerUnseen = useDemo((s) => s.ownerUnseen);
  const customerUnseen = useDemo((s) => s.customerUnseen);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3500);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <header className="on-dark flex shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-900 px-3 py-2 text-cream">
      <div className="flex min-w-0 items-center gap-2">
        <PennyAvatar size={28} />
        <p className="hidden min-w-0 leading-tight sm:block">
          <span className="block truncate text-[14px] font-semibold">Penny</span>
          <span className="block truncate text-[11px] text-ink-300">AI receptionist for home-services businesses</span>
        </p>
      </div>

      <div role="group" aria-label="View" className="mx-auto flex shrink-0 rounded-xl bg-ink-800 p-0.5">
        {VIEWS.filter((v) => wide || !v.desktopOnly).map(({ id, label, icon: Icon }) => {
          const selected = view === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              data-testid={`view-${id}`}
              onClick={() => setView(id)}
              className={cn(
                "tap relative flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] font-semibold transition sm:px-3",
                selected ? "bg-cream text-ink-900 shadow" : "text-ink-200 hover:text-cream",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
              {id === "owner" && !selected && (hasAlert || ownerUnseen > 0) ? (
                <span
                  data-testid="owner-badge"
                  className={cn(
                    "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white ring-2 ring-ink-800",
                    hasAlert ? "bg-red-500" : "bg-copper-500",
                  )}
                  aria-label={hasAlert ? "Emergency alert on the dashboard" : `${ownerUnseen} new on the dashboard`}
                >
                  {hasAlert ? "!" : ownerUnseen}
                </span>
              ) : null}
              {id === "customer" && !selected && customerUnseen > 0 ? (
                <span
                  data-testid="customer-badge"
                  className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-copper-500 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-ink-800"
                  aria-label={`${customerUnseen} new in the chat`}
                >
                  {customerUnseen}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {mode ? (
          <span
            className={cn(
              "hidden rounded-full px-2 py-1 text-[10.5px] font-semibold tracking-wide uppercase lg:inline",
              mode === "live" ? "bg-emerald-400/15 text-emerald-300" : "bg-copper-400/15 text-copper-300",
            )}
            title={mode === "live" ? `Live: replies come from ${model}` : "Replay: scripted conversations running on the real tools. Add an API key to go live."}
          >
            {mode === "live" ? `Live · ${model}` : "Replay mode"}
          </span>
        ) : null}
        <Link
          href="/case-study"
          title="How Penny works and what she costs to run"
          aria-label="Case study"
          className="tap flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold text-ink-200 ring-1 ring-ink-600 transition hover:bg-ink-800"
        >
          <FileText className="size-4" aria-hidden />
          <span className="hidden xl:inline">Case study</span>
        </Link>
        <button
          type="button"
          data-testid="xray-toggle"
          aria-pressed={xray}
          onClick={() => setXray(!xray)}
          title="X-ray: see every tool call, citation, token and cent"
          className={cn(
            "tap flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold transition",
            xray ? "bg-copper-500 text-ink-950" : "text-ink-200 ring-1 ring-ink-600 hover:bg-ink-800",
          )}
        >
          <ScanSearch className="size-4" aria-hidden />
          <span className="hidden md:inline">X-ray</span>
        </button>
        <button
          type="button"
          data-testid="reset-demo"
          onClick={() => {
            if (confirming) {
              reset();
              setConfirming(false);
            } else setConfirming(true);
          }}
          title="Start over with a fresh sandbox"
          className={cn(
            "tap flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold transition",
            confirming ? "bg-red-600 text-white" : "text-ink-200 ring-1 ring-ink-600 hover:bg-ink-800",
          )}
        >
          <RotateCcw className="size-4" aria-hidden />
          <span className={cn(!confirming && "hidden md:inline")}>{confirming ? "Tap again to reset" : "Reset demo"}</span>
        </button>
      </div>
    </header>
  );
}

function PaneLabel({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="on-dark hidden shrink-0 items-center gap-2 bg-ink-800 px-3 py-1 text-[11px] text-ink-200 lg:flex">
      <span className="text-copper-300" aria-hidden>
        {icon}
      </span>
      <span className="font-semibold tracking-wide text-cream uppercase">{title}</span>
      <span className="truncate text-ink-300">{hint}</span>
    </div>
  );
}

function CustomerPane() {
  const chatOpen = useDemo((s) => s.chatOpen);
  const setChatOpen = useDemo((s) => s.setChatOpen);
  return (
    <div className="@container relative flex h-full min-h-0 flex-col bg-cream" data-testid="customer-pane">
      <PaneLabel icon={<MonitorSmartphone className="size-3.5" />} title="Customer view" hint="Copperline's website, with Penny on it" />
      <div className="hidden shrink-0 items-center gap-2 border-b border-ink-100 bg-ink-50 px-3 py-1.5 @md:flex" aria-hidden>
        <span className="flex gap-1">
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
        </span>
        <span className="mx-auto w-full max-w-sm truncate rounded-md bg-white px-3 py-0.5 text-center text-[11px] text-ink-500 ring-1 ring-ink-100">copperline-plumbing.example</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="scroll-thin h-full overflow-y-auto">
          <CopperlineSite onOpenChat={() => setChatOpen(true)} />
        </div>
        {chatOpen ? (
          <div className="absolute inset-0 z-20 flex flex-col @md:inset-auto @md:right-4 @md:bottom-4 @md:h-[min(680px,calc(100%-5.25rem))] @md:w-[390px] @md:overflow-hidden @md:rounded-2xl @md:shadow-[0_24px_60px_-12px_rgb(11_18_32/0.45)] @md:ring-1 @md:ring-ink-900/10">
            <ChatWidget onMinimize={() => setChatOpen(false)} />
          </div>
        ) : (
          <button
            type="button"
            data-testid="chat-launcher"
            onClick={() => setChatOpen(true)}
            className="absolute right-4 bottom-4 z-20 flex h-14 items-center gap-2.5 rounded-full bg-ink-900 pr-5 pl-2.5 text-[14px] font-semibold text-cream shadow-xl ring-1 ring-white/10 transition hover:bg-ink-800"
          >
            <PennyAvatar size={38} />
            Chat with Penny
          </button>
        )}
      </div>
    </div>
  );
}

function OwnerPane() {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="owner-pane">
      <PaneLabel icon={<LayoutDashboard className="size-3.5" />} title="Owner view" hint="Everything Penny does lands here in real time" />
      <div className="min-h-0 flex-1">
        <Dashboard />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-ink-900" role="status" aria-label="Loading the demo">
      <div className="flex flex-col items-center gap-3 text-ink-300">
        <PennyAvatar size={48} className="motion-safe:animate-pulse" />
        <p className="text-[13px]">Setting up your sandbox…</p>
      </div>
    </div>
  );
}

export function DemoApp({ authorName, hireUrl }: { authorName: string; hireUrl: string }) {
  const ready = useDemo((s) => s.ready);
  const hydrate = useDemo((s) => s.hydrate);
  const setStatus = useDemo((s) => s.setStatus);
  const storedView = useDemo((s) => s.view);
  const xray = useDemo((s) => s.xray);
  const wide = useMediaQuery("(min-width: 1024px)", true);
  // On narrow screens there is no room for two panes: split becomes tabs.
  const view: ViewMode = !wide && storedView === "split" ? "customer" : storedView;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((res) => res.json() as Promise<{ mode: "live" | "replay"; model: string | null }>)
      .then((status) => {
        if (!cancelled) setStatus(status.mode, status.model);
      })
      .catch(() => {
        // The pill simply stays hidden until the first reply reports the mode.
      });
    return () => {
      cancelled = true;
    };
  }, [setStatus]);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <DemoBanner authorName={authorName} hireUrl={hireUrl} />
      <TopBar wide={wide} view={view} />
      {!ready ? (
        <Skeleton />
      ) : (
        <>
          <main className={cn("grid min-h-0 flex-1 gap-px bg-ink-700", view === "split" ? "grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]" : "grid-cols-1")}>
            {view !== "owner" && <CustomerPane />}
            {view !== "customer" && <OwnerPane />}
          </main>
          {xray && (
            <div className="h-[38dvh] min-h-[220px] shrink-0 border-t-2 border-copper-500">
              <XrayPanel />
            </div>
          )}
        </>
      )}
      <CitationDrawer />
      <FlightLayer />
    </div>
  );
}
