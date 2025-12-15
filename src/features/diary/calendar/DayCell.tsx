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
  
  // Get pain color for tinted background
  const painColor = hasPainData ? getColorForPain(maxPain) : undefined;
  
  // Tooltip text
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
              "relative flex flex-col items-center justify-center gap-0.5",
              "h-12 w-full min-w-[40px]",
              "transition-all duration-150",
              "touch-manipulation rounded-xl",
              // Base state
              isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40',
              // Clickable state
              hasEntries && 'cursor-pointer active:scale-95',
              !hasEntries && 'cursor-default',
              // Today marker - outer ring (always visible if today)
              today && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            )}
            style={hasPainData && painColor ? {
              // Softer background with pain color
              backgroundColor: `color-mix(in srgb, ${painColor} 15%, transparent)`,
              // Subtle border with pain color
              boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${painColor} 40%, transparent)`,
            } : hasEntries && !hasPainData ? {
              // No pain data but has entries - subtle muted indicator
              backgroundColor: 'hsl(var(--muted) / 0.3)',
              boxShadow: 'inset 0 0 0 1.5px hsl(var(--muted-foreground) / 0.15)',
            } : undefined}
          >
            {/* Day number */}
            <span className={cn(
              "text-sm font-semibold leading-none",
              today && "text-primary"
            )}>
              {dayNumber}
            </span>
            
            {/* Pain level indicator - shows number for accessibility */}
            {hasPainData && maxPain !== null && (
              <span 
                className="text-[9px] font-bold leading-none opacity-80"
                style={{ color: painColor }}
              >
                {maxPain}
              </span>
            )}
            
            {/* Entry dot for days with entries but no pain data */}
            {hasEntries && !hasPainData && (
              <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
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
