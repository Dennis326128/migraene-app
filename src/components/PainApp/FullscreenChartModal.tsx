import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Maximize2, Smartphone } from "lucide-react";
import { TimeRangeButtons, type TimeRangePreset } from "./TimeRangeButtons";

interface FullscreenChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** Optional: show time range controls in fullscreen */
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

export function FullscreenChartModal({
  open,
  onOpenChange,
  title,
  children,
  timeRange,
  onTimeRangeChange,
}: FullscreenChartModalProps) {
  const isLandscape = useIsLandscape();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-full h-[100dvh] p-0 border-0 rounded-none bg-background flex flex-col [&>button]:hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
          <h2 className="text-sm font-semibold truncate mx-4">{title}</h2>
          <div className="w-20" /> {/* spacer for centering */}
        </div>

        {/* Time range controls */}
        {timeRange && onTimeRangeChange && (
          <div className="px-4 py-2 border-b border-border shrink-0">
            <TimeRangeButtons
              value={timeRange}
              onChange={onTimeRangeChange}
            />
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
      variant="outline"
      size="sm"
      onClick={onClick}
      className="flex items-center gap-2 h-7 text-xs"
    >
      <Maximize2 className="h-3.5 w-3.5" />
      Vollbild
    </Button>
  );
}
