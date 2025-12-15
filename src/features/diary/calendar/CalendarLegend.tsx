import React from 'react';
import { getPainLegend } from './painColorScale';

export const CalendarLegend: React.FC = () => {
  const legend = getPainLegend();
  
  // Show 4 key levels for simplicity: 0, 3, 6, 10
  const keyLevels = [0, 3, 6, 10];
  const labels = ['leicht', '', '', 'stark'];
  
  return (
    <div className="flex items-center justify-center gap-3 py-2 mt-2">
      <span className="text-[10px] text-muted-foreground/70">Stärke:</span>
      
      <div className="flex items-center gap-0.5">
        {keyLevels.map((level, idx) => {
          const item = legend.find(l => l.level === level);
          if (!item) return null;
          
          return (
            <div key={level} className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded"
                style={{ backgroundColor: item.color }}
              />
              {labels[idx] && (
                <span className="text-[9px] text-muted-foreground/60">
                  {labels[idx]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
