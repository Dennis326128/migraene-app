import React from 'react';
import { cn } from '@/lib/utils';
import { getColorForPain, getTextColorForPain, isSeverePain } from './painColorScale';
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
  const isSevere = hasPainData && isSeverePain(maxPain);
  
  // Get pain color for full background
  const painColor = hasPainData ? getColorForPain(maxPain) : undefined;
  const textColor = hasPainData && maxPain !== null ? getTextColorForPain(maxPain) : undefined;
  
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
              "touch-manipulation rounded-md",
              // Current vs other month base visibility
              !isCurrentMonth && 'opacity-30',
              // Clickable state
              hasEntries && 'cursor-pointer active:scale-95',
              !hasEntries && 'cursor-default',
              // Today marker - thin ring that doesn't break the color
              today && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
              // Severe pain marker - stronger border for 9-10
              isSevere && !today && 'ring-2 ring-red-600 dark:ring-red-500'
            )}
            style={hasPainData && painColor ? {
              // Full background with pain color
              backgroundColor: painColor,
              color: textColor,
            } : hasEntries && !hasPainData ? {
              // Has entries but no pain data - muted fill
              backgroundColor: 'hsl(var(--muted) / 0.5)',
            } : {
              // No entries - very subtle neutral background
              backgroundColor: 'hsl(var(--muted) / 0.15)',
            }}
          >
            {/* Day number only - no other markers */}
            <span className={cn(
              "text-xs font-medium leading-none",
              today && !hasPainData && "text-primary font-semibold",
              !hasPainData && !hasEntries && (isCurrentMonth ? "text-muted-foreground" : "text-muted-foreground/50"),
              // Extra emphasis for severe pain
              isSevere && "font-bold"
            )}>
              {dayNumber}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
