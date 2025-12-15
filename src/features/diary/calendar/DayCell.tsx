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
  const hasMultipleEntries = entryCount > 1;
  
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
              "relative flex items-center justify-center",
              "aspect-square w-full",
              "transition-all duration-150",
              "touch-manipulation rounded-lg",
              // Base cell styling - subtle for all days
              "bg-muted/20",
              // Current vs other month
              isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/30',
              // Clickable state
              hasEntries && 'cursor-pointer active:scale-95',
              !hasEntries && 'cursor-default',
              // Today marker - thin ring
              today && 'ring-1.5 ring-primary ring-offset-1 ring-offset-background'
            )}
            style={hasPainData && painColor ? {
              // Tinted background with pain color (15% opacity)
              backgroundColor: `color-mix(in srgb, ${painColor} 18%, transparent)`,
            } : hasEntries && !hasPainData ? {
              // Has entries but no pain data
              backgroundColor: 'hsl(var(--muted) / 0.4)',
            } : undefined}
          >
            {/* Day number - centered */}
            <span className={cn(
              "text-xs font-medium leading-none",
              today && "text-primary font-semibold",
              hasPainData && "text-foreground"
            )}>
              {dayNumber}
            </span>
            
            {/* Pain level indicator - small number bottom right */}
            {hasPainData && maxPain !== null && (
              <span 
                className="absolute bottom-0.5 right-1 text-[8px] font-bold leading-none"
                style={{ color: painColor }}
              >
                {maxPain}
              </span>
            )}
            
            {/* Multiple entries indicator - small dot top right */}
            {hasMultipleEntries && (
              <span 
                className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full"
                style={{ backgroundColor: painColor || 'hsl(var(--muted-foreground) / 0.5)' }}
              />
            )}
            
            {/* Entry dot for days with entries but no pain data */}
            {hasEntries && !hasPainData && (
              <span className="absolute bottom-0.5 right-1 w-1 h-1 rounded-full bg-muted-foreground/50" />
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
