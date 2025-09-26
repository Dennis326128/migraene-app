import * as React from "react"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

interface PainSliderProps {
  value: number
  onValueChange: (value: number) => void
  disabled?: boolean
  className?: string
}

const painLabels = {
  0: "Keine Schmerzen",
  1: "Minimal", 
  2: "Leicht",
  3: "Leicht-mittel",
  4: "Mittel",
  5: "Mittel-stark", 
  6: "Stark",
  7: "Stark-sehr stark",
  8: "Sehr stark",
  9: "Sehr stark-unerträglich",
  10: "Unerträglich"
}

const painEmojis = {
  0: "😊", 1: "🙂", 2: "😐", 3: "😕", 4: "☹️",
  5: "😣", 6: "😖", 7: "😫", 8: "😰", 9: "😭", 10: "🤯"
}

function getPainColor(value: number): string {
  if (value === 0) return "hsl(var(--success))" // Green
  if (value <= 2) return "hsl(142, 76%, 36%)" // Light green
  if (value <= 4) return "hsl(45, 93%, 47%)" // Yellow
  if (value <= 6) return "hsl(24, 100%, 50%)" // Orange
  if (value <= 8) return "hsl(0, 84%, 60%)" // Red
  return "hsl(0, 84%, 40%)" // Dark red
}

function triggerHapticFeedback() {
  if ('vibrate' in navigator) {
    navigator.vibrate(30)
  }
}

export function PainSlider({ value, onValueChange, disabled, className }: PainSliderProps) {
  const handleValueChange = (newValue: number[]) => {
    const painValue = newValue[0]
    onValueChange(painValue)
    triggerHapticFeedback()
  }

  const painColor = getPainColor(value)
  
  return (
    <div className={cn("w-full space-y-4", className)}>
      {/* Slider */}
      <div className="px-3">
        <Slider
          value={[value]}
          onValueChange={handleValueChange}
          max={10}
          min={0}
          step={1}
          disabled={disabled}
          className="w-full"
          style={{
            '--slider-color': painColor
          } as React.CSSProperties}
        />
        
        {/* Scale Labels */}
        <div className="flex justify-between mt-2 px-1">
          <span className="text-xs text-muted-foreground">0</span>
          <span className="text-xs text-muted-foreground">2</span>
          <span className="text-xs text-muted-foreground">4</span>
          <span className="text-xs text-muted-foreground">6</span>
          <span className="text-xs text-muted-foreground">8</span>
          <span className="text-xs text-muted-foreground">10</span>
        </div>
        
        {/* End Labels */}
        <div className="flex justify-between mt-1">
          <span className="text-xs text-success">Keine Schmerzen</span>
          <span className="text-xs text-destructive">Unerträglich</span>
        </div>
      </div>
    </div>
  )
}