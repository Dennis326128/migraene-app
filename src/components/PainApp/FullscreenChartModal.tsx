import React, { useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2 } from "lucide-react";
import { AppHeader } from "@/components/ui/app-header";
import { TimeRangeSelector } from "./TimeRangeSelector";
import type { TimeRangePreset } from "./TimeRangeButtons";

interface FullscreenChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** @deprecated — kept for backwards compat but TimeRangeSelector uses global context */
  timeRange?: TimeRangePreset;
  /** @deprecated */
  onTimeRangeChange?: (range: TimeRangePreset) => void;
}

function useSwipeDown(onSwipeDown: () => void) {
  const startY = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.changedTouches[0].clientY - startY.current;
    if (delta > 80) onSwipeDown();
    startY.current = null;
  }, [onSwipeDown]);

  return { onTouchStart, onTouchEnd };
}

export function FullscreenChartModal({
  open,
  onOpenChange,
  title,
  children,
  timeRange,
  onTimeRangeChange,
}: FullscreenChartModalProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const swipe = useSwipeDown(close);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[100vw] w-full h-[100dvh] p-0 border-0 rounded-none bg-background flex flex-col [&>button]:hidden animate-fade-in"
        onTouchStart={swipe.onTouchStart}
        onTouchEnd={swipe.onTouchEnd}
      >
        {/* Unified AppHeader */}
        <AppHeader
          title={title}
          onBack={close}
          sticky
          className="border-b border-border shrink-0"
        />

        {/* Time range controls — uses global context */}
        {(timeRange || onTimeRangeChange) && (
          <div className="px-4 py-2 border-b border-border shrink-0">
            <TimeRangeSelector />
          </div>
        )}

        {/* Chart area - uses full remaining space */}
        <div className="flex-1 overflow-auto p-4 min-h-0">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FullscreenChartButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
      aria-label="Vollbild"
    >
      <Maximize2 className="h-4 w-4" />
    </Button>
  );
}
