/**
 * Legend for ME/CFS donut chart.
 * Shows counts only when showPercent is false, counts + % when true.
 * Hides "Keine Dokumentation" row if count is 0.
 */
import type { MeCfsSlice } from "./types";

interface MeCfsLegendProps {
  slices: MeCfsSlice[];
  totalDays: number;
  showPercent: boolean;
}

export function MeCfsLegend({ slices, totalDays, showPercent }: MeCfsLegendProps) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      {slices.map(slice => {
        if (slice.segment === 'undocumented' && slice.count === 0) return null;
        const isZero = slice.count === 0;
        const pct = totalDays > 0 ? Math.round((slice.count / totalDays) * 100) : 0;

        return (
          <div key={slice.segment} className={`flex items-center gap-2 ${isZero ? 'opacity-40' : ''}`}>
            <span
              className="inline-block shrink-0 rounded-sm"
              style={{ width: 10, height: 10, backgroundColor: slice.color }}
            />
            <span className="text-muted-foreground">{slice.label}</span>
            <span className="text-foreground ml-auto tabular-nums font-medium">
              {slice.count}
              {showPercent && totalDays > 0 && (
                <span className="ml-1 text-muted-foreground font-normal">· {pct}%</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
