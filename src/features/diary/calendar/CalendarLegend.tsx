import React from 'react';
import { generateColorScale } from './painColorScale';

export const CalendarLegend: React.FC = () => {
  const colors = generateColorScale();
  
  return (
    <div className="flex items-center justify-center gap-2 py-2">
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
  );
};
