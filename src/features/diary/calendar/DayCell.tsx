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
  const hasMultiple = entryCount > 1;
  
  // Determine background color
  const bgColor = hasEntries 
    ? getColorForPain(maxPain)
    : 'transparent';
  
  // Text color for contrast
  const textColor = hasEntries && maxPain !== null
    ? 'text-white'
    : 'text-muted-foreground';
  
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
              "relative aspect-square w-full rounded-md text-xs font-medium",
              "flex items-center justify-center",
              "transition-all duration-200",
              "touch-manipulation",
              isCurrentMonth ? 'opacity-100' : 'opacity-40',
              today && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
              hasEntries && 'cursor-pointer hover:scale-105 active:scale-95',
              !hasEntries && 'cursor-default bg-muted/10',
              textColor
            )}
            style={{
              backgroundColor: hasEntries ? bgColor : undefined
            }}
          >
            {dayNumber}
            
            {/* Multiple entries indicator */}
            {hasMultiple && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-background text-[8px] font-bold text-foreground shadow-sm border border-border">
                {entryCount > 9 ? '9+' : entryCount}
              </span>
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
