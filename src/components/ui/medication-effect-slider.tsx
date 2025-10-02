import * as React from "react"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

interface MedicationEffectSliderProps {
  value: number
  onValueChange: (value: number) => void
  disabled?: boolean
  className?: string
}

const effectLabels = {
  0: "Gar nicht geholfen",
  1: "Kaum geholfen", 
  2: "Wenig geholfen",
  3: "Leicht geholfen",
  4: "Etwas geholfen",
  5: "Mittel geholfen", 
  6: "Ziemlich geholfen",
  7: "Gut geholfen",
  8: "Sehr gut geholfen",
  9: "Ausgezeichnet geholfen",
  10: "Perfekt geholfen"
}

const effectEmojis = {
  0: "❌", 1: "🔴", 2: "🟠", 3: "🟡", 4: "🟡",
  5: "🟢", 6: "🟢", 7: "✅", 8: "✅", 9: "⭐", 10: "🌟"
}

function getEffectColor(value: number): string {
  if (value === 0) return "hsl(var(--destructive))" // Red
  if (value <= 2) return "hsl(0, 84%, 60%)" // Light red
  if (value <= 4) return "hsl(24, 100%, 50%)" // Orange
  if (value <= 6) return "hsl(45, 93%, 47%)" // Yellow
  if (value <= 8) return "hsl(142, 76%, 36%)" // Light green
  return "hsl(var(--success))" // Green
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
  
  return (
    <div className={cn("w-full space-y-4", className)}>
      <div className="flex items-center justify-center mb-2">
        <div className="text-center">
          <div className="text-2xl mb-1">{effectEmojis[value as keyof typeof effectEmojis]}</div>
          <div className="text-sm font-medium">{effectLabels[value as keyof typeof effectLabels]}</div>
        </div>
      </div>

      {/* Slider */}
      <div className="px-1">
        <Slider
          value={[value]}
          onValueChange={handleValueChange}
          max={10}
          min={0}
          step={1}
          disabled={disabled}
          className="w-full"
          style={{
            '--slider-color': effectColor
          } as React.CSSProperties}
        />
        
        {/* End Labels */}
        <div className="flex justify-between mt-2">
          <span className="text-xs text-destructive">Gar nicht</span>
          <span className="text-xs text-success">Perfekt</span>
        </div>
      </div>
    </div>
  )
}