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
  const [isDragging, setIsDragging] = React.useState(false)
  const [showValueTooltip, setShowValueTooltip] = React.useState(false)
  const [longPressActive, setLongPressActive] = React.useState(false)
  
  const handleValueChange = (newValue: number[]) => {
    const painValue = newValue[0]
    onValueChange(painValue)
    triggerHapticFeedback()
    
    // Show temporary tooltip when dragging
    if (isDragging) {
      setShowValueTooltip(true)
      setTimeout(() => setShowValueTooltip(false), 1500)
    }
  }

  const handlePointerDown = () => {
    setIsDragging(true)
    setShowValueTooltip(true)
  }

  const handlePointerUp = () => {
    setIsDragging(false)
    setTimeout(() => setShowValueTooltip(false), 1000)
  }

  // Long press for precision mode (future enhancement)
  const handleLongPress = () => {
    setLongPressActive(true)
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]) // Different pattern for precision mode
    }
  }

  const painColor = getPainColor(value)
  
  return (
    <div className={cn("w-full space-y-4", className)}>
      {/* Current Value Display with Emoji */}
      <div className="flex items-center justify-center mb-4">
        <div className={cn(
          "text-center transition-all duration-300",
          showValueTooltip && "scale-110"
        )}>
          <div className="text-3xl mb-1">{painEmojis[value as keyof typeof painEmojis]}</div>
          <div className="text-lg font-semibold" style={{ color: painColor }}>
            {value}/10
          </div>
          <div className="text-sm text-muted-foreground">
            {painLabels[value as keyof typeof painLabels]}
          </div>
        </div>
      </div>

      {/* Enhanced Slider */}
      <div className="px-1 relative">
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
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        />
        
        {/* Value indicators */}
        <div className="flex justify-between mt-3 px-1">
          <span className="text-xs text-success font-medium">0</span>
          <span className="text-xs text-muted-foreground">5</span>
          <span className="text-xs text-destructive font-medium">10</span>
        </div>
        
        {/* End Labels */}
        <div className="flex justify-between mt-2">
          <span className="text-xs text-success">Keine Schmerzen</span>
          <span className="text-xs text-destructive">Unerträglich</span>
        </div>
      </div>

      {/* Mobile Quick Selection Buttons - Prominent placement */}
      <div className="grid grid-cols-5 gap-2 mt-6 sm:hidden">
        {[0, 3, 5, 7, 10].map((level) => (
          <button
            key={level}
            onClick={() => {
              onValueChange(level)
              triggerHapticFeedback()
            }}
            disabled={disabled}
            className={cn(
              "p-3 rounded-xl text-base font-bold transition-all touch-manipulation flex flex-col items-center gap-1",
              value === level
                ? "ring-4 ring-offset-2 scale-110 shadow-lg"
                : "bg-muted hover:bg-accent text-muted-foreground shadow-sm"
            )}
            style={value === level ? { 
              backgroundColor: getPainColor(level),
              color: 'white'
            } : {}}
          >
            <span className="text-xl">{painEmojis[level as keyof typeof painEmojis]}</span>
            <span>{level}</span>
          </button>
        ))}
      </div>
    </div>
  )
}