import React from 'react';
import { getPainLegend } from './painColorScale';

export const CalendarLegend: React.FC = () => {
  const legend = getPainLegend();
  
  // Show key levels: 0, 3, 5, 7, 10
  const keyLevels = [0, 3, 5, 7, 10];
  
  return (
    <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-card/50 rounded-xl border border-border/50">
      <span className="text-xs text-muted-foreground mr-1">Stärke:</span>
      
      <div className="flex items-center gap-1">
        {legend.map((item) => {
          const isKeyLevel = keyLevels.includes(item.level);
          return (
            <div
              key={item.level}
              className="flex flex-col items-center"
            >
              <div
                className="w-3 h-3 rounded-md transition-transform hover:scale-110"
                style={{ 
                  backgroundColor: item.color,
                  boxShadow: `0 1px 3px ${item.color}40`
                }}
              />
              {isKeyLevel && (
                <span className="text-[9px] text-muted-foreground mt-0.5 font-medium">
                  {item.level}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
