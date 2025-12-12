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

// Convert hex/hsl color to rgba with opacity
const colorWithOpacity = (color: string, opacity: number): string => {
  // If it's already a valid color, use it with opacity via CSS
  return color;
};

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
              "relative flex items-center justify-center",
              "h-11 w-full min-w-[40px]",
              "text-base font-semibold",
              "transition-all duration-150",
              "touch-manipulation rounded-lg",
              // Base state
              isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40',
              // Clickable state
              hasEntries && 'cursor-pointer active:scale-95',
              !hasEntries && 'cursor-default',
              // Today marker - outer ring (always visible if today)
              today && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
            )}
            style={hasPainData && painColor ? {
              // Tinted background with low opacity
              backgroundColor: `color-mix(in srgb, ${painColor} 18%, transparent)`,
              // Border with medium opacity
              border: `1.5px solid color-mix(in srgb, ${painColor} 40%, transparent)`,
            } : hasEntries && !hasPainData ? {
              // No pain data but has entries - subtle gray indicator
              backgroundColor: 'hsl(var(--muted) / 0.3)',
              border: '1.5px solid hsl(var(--muted-foreground) / 0.2)',
            } : undefined}
          >
            {/* Day number */}
            <span className={cn(
              "leading-none",
              today && "text-primary"
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
