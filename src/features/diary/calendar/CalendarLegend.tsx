import React from 'react';
import { getPainLegend } from './painColorScale';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const CalendarLegend: React.FC = () => {
  const legend = getPainLegend();
  
  return (
    <div className="flex items-center justify-center gap-1.5 py-2 px-3 bg-card/30 rounded-lg">
      <span className="text-[10px] text-muted-foreground">0</span>
      
      <div className="flex gap-px">
        {legend.map((item) => (
          <div
            key={item.level}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />
        ))}
      </div>
      
      <span className="text-[10px] text-muted-foreground">10</span>
      
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors">
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[180px]">
            Schmerzstärke pro Tag (0-10)
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
