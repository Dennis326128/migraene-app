import React, { useEffect, useState, useRef, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2, X, Smartphone } from "lucide-react";
import { TimeRangeButtons, type TimeRangePreset } from "./TimeRangeButtons";

interface FullscreenChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  timeRange?: TimeRangePreset;
  onTimeRangeChange?: (range: TimeRangePreset) => void;
}

function useIsLandscape() {
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== "undefined" ? window.innerWidth > window.innerHeight : true
  );
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);
  return isLandscape;
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
  const isLandscape = useIsLandscape();
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const swipe = useSwipeDown(close);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[100vw] w-full h-[100dvh] p-0 border-0 rounded-none bg-background flex flex-col [&>button]:hidden animate-fade-in"
        onTouchStart={swipe.onTouchStart}
        onTouchEnd={swipe.onTouchEnd}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold truncate">{title}</h2>
          {/* Time range controls inline on desktop */}
          {timeRange && onTimeRangeChange && (
            <div className="hidden sm:block mx-4">
              <TimeRangeButtons value={timeRange} onChange={onTimeRangeChange} />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={close}
            className="shrink-0 h-8 w-8"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Time range controls on mobile */}
        {timeRange && onTimeRangeChange && (
          <div className="px-4 py-2 border-b border-border shrink-0 sm:hidden">
            <TimeRangeButtons value={timeRange} onChange={onTimeRangeChange} />
          </div>
        )}

        {/* Chart area or landscape prompt */}
        <div className="flex-1 overflow-hidden relative">
          {!isLandscape ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 z-10 text-center px-6">
              <Smartphone className="h-10 w-10 text-muted-foreground mb-4 rotate-90" />
              <p className="text-base font-medium mb-1">
                Für optimale Darstellung bitte Gerät drehen.
              </p>
              <p className="text-sm text-muted-foreground">
                Das Diagramm wird im Querformat angezeigt.
              </p>
            </div>
          ) : (
            <div className="w-full h-full p-4">
              {children}
            </div>
          )}
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
