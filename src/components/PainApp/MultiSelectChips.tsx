import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

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

const riskColors = {
  low: 'border-[#22C55E]/40 bg-[#22C55E]/5 text-[#22C55E]',
  medium: 'border-[#FB923C]/40 bg-[#FB923C]/5 text-[#FB923C]',
  high: 'border-[#F97373]/40 bg-[#F97373]/5 text-[#F97373]',
};

export const MultiSelectChips: React.FC<MultiSelectChipsProps> = ({
  title,
  icon: Icon,
  options,
  selected,
  onChange,
}) => {
  const toggleChip = (chipId: string) => {
    if (selected.includes(chipId)) {
      onChange(selected.filter(id => id !== chipId));
    } else {
      onChange([...selected, chipId]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-[#9CA3AF]">
        {Icon && <Icon className="h-4 w-4" />}
        <span>{title}</span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.id);
          
          return (
            <button
              key={option.id}
              onClick={() => toggleChip(option.id)}
              className={cn(
                'px-3 py-2 rounded-full text-sm font-medium',
                'border transition-all duration-150',
                'touch-manipulation select-none',
                'min-h-[40px]',
                'focus:outline-none focus:ring-2 focus:ring-[#22C55E]/50 focus:ring-offset-2 focus:ring-offset-[#020617]',
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
                'transition-transform duration-100',
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
