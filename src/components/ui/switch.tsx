import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    {...props}
    className={cn(
      // Container (Track)
      "peer inline-flex h-[28px] w-[52px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ease-in-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-green-500",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-[rgb(52,199,89)] data-[state=unchecked]:bg-gray-300",
      className
    )}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Thumb (der runde Knopf)
        "pointer-events-none block h-[22px] w-[22px] rounded-full bg-white shadow-md ring-0",
        "transition-transform duration-300 ease-in-out",
        "data-[state=checked]:translate-x-[24px] data-[state=unchecked]:translate-x-[3px]"
      )}
    />
  </SwitchPrimitives.Root>
))

Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
