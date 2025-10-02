import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center py-4",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted/40">
      <SliderPrimitive.Range 
        className="absolute h-full rounded-full transition-all duration-300"
        style={{
          background: 'var(--slider-color, hsl(var(--primary)))'
        }}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb 
      className="block h-7 w-7 rounded-full bg-background transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 active:scale-95 cursor-grab active:cursor-grabbing"
      style={{
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)',
        border: '0.5px solid rgba(0, 0, 0, 0.04)'
      }}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
