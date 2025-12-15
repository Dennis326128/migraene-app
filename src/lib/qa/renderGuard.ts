/**
 * Render Guard - Detects excessive re-renders in DEV mode
 * Helps identify potential infinite render loops
 */

import { useRef, useEffect } from 'react';

interface RenderCount {
  count: number;
  firstRenderAt: number;
}

const renderCounts = new Map<string, RenderCount>();
const RENDER_THRESHOLD = 30;
const TIME_WINDOW_MS = 2000;
const warnedComponents = new Set<string>();

/**
 * Hook to detect excessive re-renders (DEV only)
 * @param componentName - Name of the component to track
 * @param enabled - Whether to enable tracking (default: import.meta.env.DEV)
 */
export function useRenderGuard(componentName: string, enabled = import.meta.env.DEV): void {
  const renderCountRef = useRef(0);
  
  useEffect(() => {
    if (!enabled) return;
    
    renderCountRef.current += 1;
    
    const now = Date.now();
    const existing = renderCounts.get(componentName);
    
    if (existing) {
      // Check if still within time window
      if (now - existing.firstRenderAt < TIME_WINDOW_MS) {
        existing.count += 1;
        
        // Check threshold
        if (existing.count >= RENDER_THRESHOLD && !warnedComponents.has(componentName)) {
          console.warn(
            `[RenderGuard] ⚠️ Possible render loop detected in "${componentName}": ` +
            `${existing.count} renders in ${TIME_WINDOW_MS}ms`
          );
          warnedComponents.add(componentName);
        }
      } else {
        // Reset counter for new time window
        renderCounts.set(componentName, { count: 1, firstRenderAt: now });
        warnedComponents.delete(componentName);
      }
    } else {
      renderCounts.set(componentName, { count: 1, firstRenderAt: now });
    }
  });
}

/**
 * Get current render stats for all tracked components (for QA page)
 */
export function getRenderStats(): Record<string, { count: number; timeElapsed: number }> {
  const now = Date.now();
  const stats: Record<string, { count: number; timeElapsed: number }> = {};
  
  renderCounts.forEach((value, key) => {
    stats[key] = {
      count: value.count,
      timeElapsed: now - value.firstRenderAt
    };
  });
  
  return stats;
}

/**
 * Clear all render stats (useful for testing)
 */
export function clearRenderStats(): void {
  renderCounts.clear();
  warnedComponents.clear();
}
