import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const startPageCardVariants = cva(
  "rounded-lg transition-all duration-200 touch-manipulation cursor-pointer select-none",
  {
    variants: {
      variant: {
        success: "bg-success/20 text-success-foreground hover:bg-success/30 border border-success/30",
        quick: "bg-destructive/20 text-destructive-foreground hover:bg-destructive/30 border border-destructive/30",
        neutral: "bg-card hover:bg-muted/50 border border-border",
        voice: "bg-primary/20 text-primary-foreground hover:bg-primary/30 border border-primary/30",
        warning: "bg-warning/20 text-warning-foreground hover:bg-warning/30 border border-warning/30",
      },
      size: {
        default: "p-4",
        large: "p-6",
        small: "p-3",
      },
      touchFeedback: {
        true: "active:scale-[0.98] hover:scale-[1.01]",
        false: "",
      }
    },
    defaultVariants: {
      variant: "neutral",
      size: "default",
      touchFeedback: true,
    },
  }
)

interface StartPageCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof startPageCardVariants> {
  touchFeedback?: boolean
}

const StartPageCard = React.forwardRef<HTMLDivElement, StartPageCardProps>(
  ({ className, variant, size, touchFeedback, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(startPageCardVariants({ variant, size, touchFeedback, className }))}
        {...props}
      />
    )
  }
)
StartPageCard.displayName = "StartPageCard"

interface StartPageCardHeaderProps {
  icon?: string
  title: string
  subtitle?: string
  className?: string
}

const StartPageCardHeader: React.FC<StartPageCardHeaderProps> = ({
  icon,
  title,
  subtitle,
  className,
}) => {
  return (
    <div className="flex items-center gap-2 sm:gap-3 min-h-[56px] sm:min-h-[64px]">
      {icon && (
        <div className="text-xl sm:text-2xl flex-shrink-0">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className={cn("font-semibold text-sm sm:text-base leading-tight break-words", className)}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs sm:text-sm opacity-90 mt-1 leading-tight break-words">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

interface StartPageButtonGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4
  gap?: "sm" | "md" | "lg"
}

const StartPageButtonGrid = React.forwardRef<HTMLDivElement, StartPageButtonGridProps>(
  ({ className, columns = 2, gap = "md", children, ...props }, ref) => {
    const gapClasses = {
      sm: "gap-2",
      md: "gap-4", 
      lg: "gap-6",
    }
    
    const columnClasses = {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3", 
      4: "grid-cols-4",
    }
    
    return (
      <div
        ref={ref}
        className={cn(
          "grid",
          columnClasses[columns],
          gapClasses[gap],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
StartPageButtonGrid.displayName = "StartPageButtonGrid"

export { 
  StartPageCard, 
  StartPageCardHeader, 
  StartPageButtonGrid, 
  startPageCardVariants 
}