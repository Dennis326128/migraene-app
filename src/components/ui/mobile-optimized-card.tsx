import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

const mobileCardVariants = cva(
  "rounded-md text-card-foreground transition-all duration-200 touch-manipulation",
  {
    variants: {
      variant: {
        default: "bg-background hover:shadow-md",
        interactive: "bg-background hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer",
        success: "bg-success hover:bg-success/90",
        warning: "bg-yellow-50 hover:bg-yellow-100",
        destructive: "bg-destructive hover:bg-destructive/90",
        primary: "bg-primary hover:bg-primary/90",
        quick: "bg-quick-entry hover:bg-quick-entry/90",
      },
      size: {
        default: "p-4",
        sm: "p-3",
        lg: "p-6",
        mobile: "p-4 sm:p-6",
        compact: "p-3 sm:p-4",
      },
      spacing: {
        default: "space-y-2",
        tight: "space-y-1",
        loose: "space-y-4",
        none: "",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "mobile",
      spacing: "default",
    },
  }
)

export interface MobileOptimizedCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof mobileCardVariants> {
  touchFeedback?: boolean
  minTouchTarget?: boolean
}

const MobileOptimizedCard = React.forwardRef<HTMLDivElement, MobileOptimizedCardProps>(
  ({ className, variant, size, spacing, touchFeedback = false, minTouchTarget = false, children, ...props }, ref) => {
    const isMobile = useIsMobile()
    
    return (
      <div
        className={cn(
          mobileCardVariants({ variant, size, spacing }),
          touchFeedback && "active:shadow-xl",
          minTouchTarget && "min-h-[44px] flex items-center",
          isMobile && "mobile-card-compact mobile-text-compact",
          className
        )}
        ref={ref}
        {...props}
      >
        <div className={cn(spacing !== "none" && mobileCardVariants({ spacing }))}>
          {children}
        </div>
      </div>
    )
  }
)
MobileOptimizedCard.displayName = "MobileOptimizedCard"

// Mobile-optimized card header
interface MobileCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  action?: React.ReactNode
}

const MobileCardHeader = React.forwardRef<HTMLDivElement, MobileCardHeaderProps>(
  ({ className, icon, title, subtitle, action, ...props }, ref) => {
    return (
      <div
        className={cn("flex items-center justify-between mb-3", className)}
        ref={ref}
        {...props}
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className="text-2xl sm:text-3xl flex-shrink-0">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base sm:text-lg text-foreground mobile-button-text">
              {title}
            </h3>
            {subtitle && (
              <p className="text-sm text-muted-foreground mobile-button-text">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && (
          <div className="flex-shrink-0">
            {action}
          </div>
        )}
      </div>
    )
  }
)
MobileCardHeader.displayName = "MobileCardHeader"

// Mobile-optimized button grid
interface MobileButtonGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4
  gap?: "sm" | "md" | "lg"
}

const MobileButtonGrid = React.forwardRef<HTMLDivElement, MobileButtonGridProps>(
  ({ className, columns = 2, gap = "md", children, ...props }, ref) => {
    const gapClasses = {
      sm: "gap-2",
      md: "gap-4",
      lg: "gap-6"
    }
    
    return (
      <div
        className={cn(
          `grid grid-cols-${columns}`,
          gapClasses[gap],
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    )
  }
)
MobileButtonGrid.displayName = "MobileButtonGrid"

export { 
  MobileOptimizedCard, 
  MobileCardHeader, 
  MobileButtonGrid,
  mobileCardVariants 
}