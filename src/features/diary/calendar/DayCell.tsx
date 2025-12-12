import React from 'react';
import { cn } from '@/lib/utils';
import { getColorForPain } from './painColorScale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isToday, format } from 'date-fns';
import { de } from 'date-fns/locale';

interface DayCellProps {
  date: Date;
  maxPain: number | null;
  entryCount: number;
  onClick: () => void;
  isCurrentMonth: boolean;
}

export const DayCell: React.FC<DayCellProps> = ({
  date,
  maxPain,
  entryCount,
  onClick,
  isCurrentMonth
}) => {
  const dayNumber = date.getDate();
  const today = isToday(date);
  const hasEntries = entryCount > 0;
  const hasPainData = hasEntries && maxPain !== null;
  
  // Get marker color for pain level
  const markerColor = hasPainData ? getColorForPain(maxPain) : undefined;
  
  // Determine if severe pain (for subtle glow effect)
  const isSevere = maxPain !== null && maxPain >= 9;
  
  const tooltipText = hasEntries
    ? maxPain !== null 
      ? `${entryCount} ${entryCount === 1 ? 'Eintrag' : 'Einträge'} • Stärke: ${maxPain}/10`
      : `${entryCount} ${entryCount === 1 ? 'Eintrag' : 'Einträge'} • Stärke nicht erfasst`
    : format(date, 'd. MMMM', { locale: de });
  
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            disabled={!hasEntries}
            className={cn(
              "relative flex flex-col items-center justify-center",
              "h-10 w-full min-w-[36px]",
              "text-sm font-medium",
              "transition-all duration-150",
              "touch-manipulation rounded-md",
              // Base state
              isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50',
              // Today marker - circle/ring around the number
              today && 'ring-2 ring-primary ring-offset-1 ring-offset-background rounded-full',
              // Clickable state
              hasEntries && 'cursor-pointer hover:bg-accent/10 active:scale-95',
              !hasEntries && 'cursor-default'
            )}
          >
            {/* Day number */}
            <span className={cn(
              "leading-none",
              today && "font-semibold text-primary"
            )}>
              {dayNumber}
            </span>
            
            {/* Pain marker dot/pill under the number */}
            {hasEntries && (
              <div className="flex items-center gap-0.5 mt-0.5">
                {/* Main pain marker */}
                <div 
                  className={cn(
                    "rounded-full transition-all",
                    hasPainData ? "w-1.5 h-1.5" : "w-1.5 h-1.5 bg-muted-foreground/40",
                    isSevere && "w-2 h-2 shadow-sm"
                  )}
                  style={hasPainData ? { 
                    backgroundColor: markerColor,
                    boxShadow: isSevere ? `0 0 4px ${markerColor}` : undefined
                  } : undefined}
                />
                
                {/* Entry count indicator (for multiple entries) */}
                {entryCount > 1 && (
                  <span className="text-[8px] text-muted-foreground font-medium leading-none">
                    {entryCount > 9 ? '9+' : entryCount}
                  </span>
                )}
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
