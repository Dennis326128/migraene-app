import React from 'react';
import { generateColorScale } from './painColorScale';

const EMPTY_PAST_STRIPES =
  'repeating-linear-gradient(45deg, hsl(var(--muted) / 0.45) 0 4px, hsl(142 76% 36% / 0.22) 4px 8px)';

export const CalendarLegend: React.FC = () => {
  const colors = generateColorScale();

  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      <div className="flex items-center justify-center gap-2">
        <span className="text-[10px] text-muted-foreground/70">leicht</span>

        <div className="flex items-center gap-0">
          {colors.map((color, level) => (
            <div
              key={level}
              className="w-3 h-3 first:rounded-l last:rounded-r"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        <span className="text-[10px] text-muted-foreground/70">stark</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: '#16a34a' }}
            aria-hidden
          />
          <span className="text-[10px] text-muted-foreground/70">schmerzfrei</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-sm border border-border/40"
            style={{ backgroundImage: EMPTY_PAST_STRIPES }}
            aria-hidden
          />
          <span className="text-[10px] text-muted-foreground/70">keine Einträge</span>
        </div>
      </div>
    </div>
  );
};
