import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

export interface ChipOption {
  id: string;
  label: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

interface MultiSelectChipsProps {
  title: string;
  icon?: LucideIcon;
  options: ChipOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export const MultiSelectChips: React.FC<MultiSelectChipsProps> = ({
  title,
  icon: Icon,
  options,
  selected,
  onChange,
}) => {
  const isMobile = useIsMobile();
  
  const toggleChip = (chipId: string) => {
    if (selected.includes(chipId)) {
      onChange(selected.filter(id => id !== chipId));
    } else {
      onChange([...selected, chipId]);
    }
  };

  return (
    <div className={cn("space-y-2", isMobile && "space-y-1.5")}>
      <div className={cn(
        "flex items-center gap-2 font-medium text-[#9CA3AF]",
        isMobile ? "text-xs" : "text-sm"
      )}>
        {Icon && <Icon className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />}
        <span>{title}</span>
      </div>
      
      <div className={cn("flex flex-wrap", isMobile ? "gap-1.5" : "gap-2")}>
        {options.map((option) => {
          const isSelected = selected.includes(option.id);
          
          return (
            <button
              key={option.id}
              onClick={() => toggleChip(option.id)}
              className={cn(
                'rounded-full font-medium',
                'border transition-all duration-150',
                'touch-manipulation select-none',
                'focus:outline-none focus:ring-2 focus:ring-[#22C55E]/50 focus:ring-offset-1 focus:ring-offset-[#020617]',
                // Mobile: slightly smaller chips
                isMobile ? 'px-2.5 py-1.5 text-xs min-h-[36px]' : 'px-3 py-2 text-sm min-h-[40px]',
                isSelected ? [
                  'bg-[#1D283A]',
                  'border-[#22C55E]',
                  'text-[#E5E7EB]',
                  'shadow-sm',
                ] : [
                  'bg-[#0B1220]/50',
                  'border-[#1F2937]',
                  'text-[#E5E7EB]',
                  'hover:bg-[#0B1220]',
                  'hover:border-[#4B5563]/50',
                ],
                'active:scale-[0.97]',
              )}
              aria-label={option.label}
              aria-pressed={isSelected}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};