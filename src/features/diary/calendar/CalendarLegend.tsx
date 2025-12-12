import React from 'react';
import { getPainLegend } from './painColorScale';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const CalendarLegend: React.FC = () => {
  const legend = getPainLegend();
  
  return (
    <div className="flex items-center justify-center gap-2 py-3 px-4 bg-card/50 rounded-lg border border-border/50">
      <span className="text-xs text-muted-foreground">0</span>
      
      <div className="flex gap-0.5">
        {legend.map((item) => (
          <div
            key={item.level}
            className="w-4 h-4 rounded-sm first:rounded-l-md last:rounded-r-md"
            style={{ backgroundColor: item.color }}
          />
        ))}
      </div>
      
      <span className="text-xs text-muted-foreground">10</span>
      
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[200px]">
            Kalender zeigt die maximale Schmerzstärke pro Tag (0-10)
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
