import React from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

export interface ScaleOption {
  value: number;
  label: string;
  emoji?: string;
  color: 'negative' | 'warning' | 'neutral' | 'positive' | 'excellent';
}

interface FivePointScaleProps {
  title: string;
  subtitle?: string;
  options: ScaleOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  showFillEffect?: boolean;
}

const colorMap = {
  negative: {
    bg: 'bg-[#0B1220]/50',
    border: 'border-[#1F2937]',
    selectedBg: 'bg-[#F97373]',
    selectedBorder: 'border-[#F97373]',
    selectedText: 'text-[#020617]',
    fillBg: 'bg-[#F97373]/10',
    fillBorder: 'border-[#F97373]/20',
  },
  warning: {
    bg: 'bg-[#0B1220]/50',
    border: 'border-[#1F2937]',
    selectedBg: 'bg-[#FB923C]',
    selectedBorder: 'border-[#FB923C]',
    selectedText: 'text-[#020617]',
    fillBg: 'bg-[#FB923C]/10',
    fillBorder: 'border-[#FB923C]/20',
  },
  neutral: {
    bg: 'bg-[#0B1220]/50',
    border: 'border-[#1F2937]',
    selectedBg: 'bg-[#4B5563]',
    selectedBorder: 'border-[#4B5563]',
    selectedText: 'text-[#E5E7EB]',
    fillBg: 'bg-[#4B5563]/10',
    fillBorder: 'border-[#4B5563]/20',
  },
  positive: {
    bg: 'bg-[#0B1220]/50',
    border: 'border-[#1F2937]',
    selectedBg: 'bg-[#22C55E]',
    selectedBorder: 'border-[#22C55E]',
    selectedText: 'text-[#020617]',
    fillBg: 'bg-[#22C55E]/10',
    fillBorder: 'border-[#22C55E]/20',
  },
  excellent: {
    bg: 'bg-[#0B1220]/50',
    border: 'border-[#1F2937]',
    selectedBg: 'bg-[#14B8A6]',
    selectedBorder: 'border-[#14B8A6]',
    selectedText: 'text-[#020617]',
    fillBg: 'bg-[#14B8A6]/10',
    fillBorder: 'border-[#14B8A6]/20',
  },
};

export const FivePointScale: React.FC<FivePointScaleProps> = ({
  title,
  subtitle,
  options,
  value,
  onChange,
  showFillEffect = true,
}) => {
  const isMobile = useIsMobile();
  
  const handleClick = (optionValue: number) => {
    onChange(value === optionValue ? null : optionValue);
  };

  return (
    <div className={cn("space-y-2", isMobile && "space-y-1.5")}>
      <div className="space-y-0.5">
        <h3 className={cn(
          "font-semibold text-[#E5E7EB]",
          isMobile ? "text-sm" : "text-base"
        )}>{title}</h3>
        {subtitle && (
          <p className={cn(
            "text-[#9CA3AF] leading-tight",
            isMobile ? "text-[11px]" : "text-xs"
          )}>{subtitle}</p>
        )}
      </div>
      
      <div className={cn("flex w-full", isMobile ? "gap-1.5" : "gap-2")}>
        {options.map((option) => {
          const isSelected = value === option.value;
          const isFilled = showFillEffect && value !== null && option.value <= value;
          const colors = colorMap[option.color];
          
          return (
            <button
              key={option.value}
              onClick={() => handleClick(option.value)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center',
                'rounded-full border transition-all duration-150',
                'touch-manipulation select-none',
                'focus:outline-none focus:ring-2 focus:ring-[#22C55E]/50 focus:ring-offset-1 focus:ring-offset-[#020617]',
                // Mobile: more compact but still tappable
                isMobile ? 'min-h-[44px] px-1 py-1.5' : 'min-h-[48px] px-2 py-2.5',
                isSelected ? [
                  colors.selectedBg,
                  colors.selectedBorder,
                  colors.selectedText,
                  'shadow-sm',
                ] : isFilled ? [
                  colors.fillBg,
                  colors.fillBorder,
                  'text-[#E5E7EB]',
                ] : [
                  colors.bg,
                  colors.border,
                  'text-[#E5E7EB]',
                  'hover:bg-[#111827]/70',
                ],
                'active:scale-[0.96]',
              )}
              aria-label={`${title}: ${option.label}`}
              aria-pressed={isSelected}
            >
              {option.emoji && (
                <span className={cn(
                  "mb-0.5",
                  isMobile ? "text-base" : "text-lg"
                )} aria-hidden="true">
                  {option.emoji}
                </span>
              )}
              <span className={cn(
                'font-medium text-center leading-tight',
                isMobile ? 'text-[10px]' : 'text-xs',
                isSelected && 'font-semibold'
              )}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};