/**
 * Hook: useRelativeTime
 *
 * Provides a tick counter that updates:
 * 1) On mount
 * 2) On visibility change (tab focus / app resume)
 * 3) At local midnight (Berlin) — so "Morgen" → "Heute" transitions correctly
 * 4) Every 60s IF hasTodayEvents is true — for "In X Min" sub-labels
 *
 * Components consuming this hook should recompute their labels when `tick` changes.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { msUntilNextMidnight } from "@/lib/relativeReminderLabel";

/**
 * Returns a tick value that increments whenever relative labels should be recalculated.
 * @param hasTodayEvents - Set to true if any visible reminder is today (enables minute timer)
 */
export function useRelativeTime(hasTodayEvents: boolean): number {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // --- Visibility change (tab focus / app resume) ---
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [bump]);

  // --- Midnight timer (Berlin) ---
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const ms = msUntilNextMidnight();
      timeoutId = setTimeout(() => {
        bump();
        scheduleNext(); // re-schedule for next midnight
      }, ms);
    };

    scheduleNext();
    return () => clearTimeout(timeoutId);
  }, [bump]);

  // --- Minute timer (only when today-events exist) ---
  useEffect(() => {
    if (!hasTodayEvents) return;

    const intervalId = setInterval(bump, 60_000);
    return () => clearInterval(intervalId);
  }, [hasTodayEvents, bump]);

  return tick;
}
