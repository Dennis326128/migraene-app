/**
 * ME/CFS Severity Selector – Segmented Control
 * 4 options: keine / leicht / mittel / schwer
 */
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ME_CFS_OPTIONS, type MeCfsSeverityLevel } from "@/lib/mecfs/constants";
import { cn } from "@/lib/utils";

interface MeCfsSeveritySelectorProps {
  value: number;
  onValueChange: (score: number, level: MeCfsSeverityLevel) => void;
  disabled?: boolean;
}

export function MeCfsSeveritySelector({ value, onValueChange, disabled }: MeCfsSeveritySelectorProps) {
  return (
    <Card className="p-6 mb-4">
      <Label className="text-base font-medium mb-1 block">
        ME/CFS-Symptomatik
      </Label>
      <p className="text-sm text-muted-foreground mb-4">
        Wie stark hat dich ME/CFS heute beeinträchtigt?
      </p>

      <div
        className="grid grid-cols-4 gap-2"
        role="radiogroup"
        aria-label="ME/CFS-Symptomatik"
      >
        {ME_CFS_OPTIONS.map((opt) => {
          const isSelected = value === opt.score;
          return (
            <button
              key={opt.level}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`ME/CFS ${opt.label}`}
              disabled={disabled}
              onClick={() => onValueChange(opt.score, opt.level)}
              className={cn(
                "rounded-lg py-3 px-2 text-sm font-medium transition-all",
                "border min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected && opt.score === 0
                  ? "bg-muted text-foreground border-border shadow-sm"
                  : isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-foreground border-border hover:bg-muted",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
