"use client";

import { Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/client/hooks";
import { useDemo, type Flight } from "@/lib/client/store";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The "job card flies onto the dispatch board" moment. When a payment
 * succeeds, a ghost card travels from the checkout card in the chat to the
 * job's cell on the board, then the real card takes over. Purely decorative:
 * it is skipped under prefers-reduced-motion or when the board is not visible.
 */
function Ghost({ flight }: { flight: Flight }) {
  const clearFlight = useDemo((s) => s.clearFlight);
  const job = useDemo((s) => s.jobs.find((j) => j.code === flight.jobCode));
  const setBoardDay = useDemo((s) => s.setBoardDay);
  const reduced = useReducedMotion();
  const [target, setTarget] = useState<Rect | null>(null);

  useEffect(() => {
    if (!job || reduced) {
      clearFlight(flight.id);
      return;
    }
    // Make sure the board is showing the day the job lands on, then measure.
    setBoardDay(job.date);
    let frame = 0;
    let tries = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-job-code="${flight.jobCode}"]`);
      const rect = el?.getBoundingClientRect();
      if (el && rect && rect.width > 0) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const settled = el.getBoundingClientRect();
        setTarget({ x: settled.left, y: settled.top, w: settled.width, h: settled.height });
        return;
      }
      tries += 1;
      if (tries > 20) clearFlight(flight.id);
      else frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [job, reduced, clearFlight, flight.id, flight.jobCode, setBoardDay]);

  if (!job || !target) return null;
  const from = flight.from;
  const startW = Math.min(from.w, 260);
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[80] flex flex-col justify-center overflow-hidden rounded-lg border-2 border-copper-500 bg-white px-2 shadow-2xl"
      initial={{ x: from.x + (from.w - startW) / 2, y: from.y + from.h / 2 - 40, width: startW, height: 80, opacity: 0.95, scale: 1 }}
      animate={{ x: target.x, y: target.y, width: target.w, height: target.h, opacity: 1, scale: [1, 1.08, 1] }}
      transition={{ duration: 0.95, ease: [0.3, 0.1, 0.2, 1] }}
      onAnimationComplete={() => clearFlight(flight.id)}
    >
      <span className="flex items-center gap-1 truncate text-[11.5px] font-semibold text-ink-900">
        <Sparkles className="size-3 shrink-0 text-copper-600" /> {job.customerName}
      </span>
      <span className="truncate text-[10.5px] text-ink-600">{job.serviceName}</span>
    </motion.div>
  );
}

export function FlightLayer() {
  const flights = useDemo((s) => s.flights);
  return (
    <>
      {flights.map((flight) => (
        <Ghost key={flight.id} flight={flight} />
      ))}
    </>
  );
}
