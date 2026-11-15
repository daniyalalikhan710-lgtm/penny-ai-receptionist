"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { clockFromDate } from "@/lib/domain/time";
import type { Clock } from "@/lib/domain/types";

const PLACEHOLDER: Clock = { today: "2000-01-01", nowMinutes: 0, tz: "UTC" };

/** The visitor's clock, refreshed twice a minute. */
export function useClock(): Clock {
  const [clock, setClock] = useState<Clock>(PLACEHOLDER);
  useEffect(() => {
    const tick = () => setClock(clockFromDate(new Date()));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return clock;
}

function subscribeMedia(query: string) {
  return (callback: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", callback);
    return () => media.removeEventListener("change", callback);
  };
}

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
