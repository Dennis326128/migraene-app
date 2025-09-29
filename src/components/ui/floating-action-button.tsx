import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const fabVariants = cva(
  "fixed z-50 inline-flex items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95 touch-manipulation",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/25",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-destructive/25",
        success: "bg-success text-success-foreground hover:bg-success/90 shadow-success/25",
        quick: "bg-quick-entry text-quick-entry-foreground hover:bg-quick-entry-hover shadow-quick-entry/25",
      },
      size: {
        default: "h-14 w-14",
        sm: "h-12 w-12",
        lg: "h-16 w-16",
        xl: "h-20 w-20",
      },
      position: {
        "bottom-right": "bottom-6 right-6",
        "bottom-left": "bottom-6 left-6",
        "bottom-center": "bottom-6 left-1/2 -translate-x-1/2",
        "top-right": "top-6 right-6",
        "top-left": "top-6 left-6",
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
      position: "bottom-right",
    },
  }
)

export interface FloatingActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof fabVariants> {
  badge?: string | number
  pulse?: boolean
}

const FloatingActionButton = React.forwardRef<HTMLButtonElement, FloatingActionButtonProps>(
  ({ className, variant, size, position, badge, pulse, children, ...props }, ref) => {
    return (
      <div className="relative">
        <button
          className={cn(
            fabVariants({ variant, size, position }),
            pulse && "animate-pulse",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </button>
        {badge && (
          <div className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center min-w-[20px] px-1">
            {badge}
          </div>
        )}
      </div>
    )
  }
)
FloatingActionButton.displayName = "FloatingActionButton"

export { FloatingActionButton, fabVariants }