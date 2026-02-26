import * as React from "react"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

interface MedicationEffectSliderProps {
  value: number
  onValueChange: (value: number) => void
  disabled?: boolean
  className?: string
}

// 6 Stufen: 0-5
const effectLabels: Record<number, string> = {
  0: "Keine Wirkung",
  1: "Gering",
  2: "Mittel",
  3: "Gut",
  4: "Sehr gut",
  5: "Perfekt"
}

const effectEmojis: Record<number, string> = {
  0: "○",
  1: "◔",
  2: "◑",
  3: "◕",
  4: "●",
  5: "✦"
}

function getEffectColor(value: number): string {
  switch (value) {
    case 0: return "hsl(var(--muted-foreground))"
    case 1: return "hsl(30, 15%, 55%)"
    case 2: return "hsl(40, 25%, 58%)"
    case 3: return "hsl(90, 25%, 52%)"
    case 4: return "hsl(142, 30%, 48%)"
    case 5: return "hsl(142, 40%, 42%)"
    default: return "hsl(var(--muted))"
  }
}

function triggerHapticFeedback() {
  if ('vibrate' in navigator) {
    navigator.vibrate(30)
  }
}

export function MedicationEffectSlider({ value, onValueChange, disabled, className }: MedicationEffectSliderProps) {
  const handleValueChange = (newValue: number[]) => {
    const effectValue = newValue[0]
    onValueChange(effectValue)
    triggerHapticFeedback()
  }

  const effectColor = getEffectColor(value)
  const label = effectLabels[value] ?? effectLabels[0]
  const emoji = effectEmojis[value] ?? effectEmojis[0]
  
  return (
    <div className={cn("w-full space-y-3", className)}>
      {/* Current value display — slightly larger, stable */}
      <div className="flex items-center justify-center">
        <div 
          className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-xl"
          style={{ backgroundColor: `${effectColor}20`, color: effectColor }}
        >
          <span>{emoji}</span>
          <span>{label}</span>
        </div>
      </div>

      {/* Slider */}
      <div className="px-1">
        <Slider
          value={[value]}
          onValueChange={handleValueChange}
          max={5}
          min={0}
          step={1}
          disabled={disabled}
          className="w-full"
          style={{
            '--slider-color': effectColor
          } as React.CSSProperties}
        />
        
        {/* Step labels underneath */}
        <div className="flex justify-between mt-2 px-1">
          {Object.entries(effectLabels).map(([step, stepLabel]) => (
            <span 
              key={step} 
              className={cn(
                "text-[10px] text-center w-12 -ml-2 first:ml-0",
                Number(step) === value ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {stepLabel}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Export for use in other components
export { effectLabels, effectEmojis, getEffectColor }
