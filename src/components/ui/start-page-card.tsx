import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const startPageCardVariants = cva(
  "rounded-xl transition-all duration-200 touch-manipulation cursor-pointer select-none shadow-sm",
  {
    variants: {
      variant: {
        success: "bg-success/15 text-foreground hover:bg-success/25 border border-success/20",
        quick: "bg-destructive/15 text-foreground hover:bg-destructive/25 border border-destructive/20",
        neutral: "bg-card/80 hover:bg-card border border-border/50",
        voice: "bg-primary/20 text-foreground hover:bg-primary/30 border-2 border-primary/40",
        voiceHighlight: "bg-gradient-to-br from-primary/25 to-primary/15 text-foreground hover:from-primary/35 hover:to-primary/25 border-2 border-primary/50 shadow-lg shadow-primary/10",
        warning: "bg-warning/20 text-foreground hover:bg-warning/30 border border-warning/30",
        muted: "bg-muted/30 hover:bg-muted/50 border border-border/30",
      },
      size: {
        default: "p-4",
        large: "p-5",
        small: "p-3",
        hero: "p-5 min-h-[88px]",
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
  icon?: string | React.ReactNode
  title: string
  subtitle?: string
  className?: string
  iconClassName?: string
  iconBgClassName?: string
}

const StartPageCardHeader: React.FC<StartPageCardHeaderProps> = ({
  icon,
  title,
  subtitle,
  className,
  iconClassName,
  iconBgClassName,
}) => {
  return (
    <div className="flex items-center gap-3 sm:gap-4 min-h-[56px] sm:min-h-[64px]">
      {icon && (
        <div className={cn(
          "w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0",
          iconBgClassName || "bg-background/50"
        )}>
          <span className={cn("text-xl sm:text-2xl", iconClassName)}>
            {icon}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h3 className={cn("font-semibold text-sm sm:text-base leading-tight break-words line-clamp-2 text-foreground", className)}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-tight break-words line-clamp-1">
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
      md: "gap-3", 
      lg: "gap-4",
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

// Section Header Component
interface SectionHeaderProps {
  title: string
  className?: string
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, className }) => {
  return (
    <h2 className={cn(
      "text-sm sm:text-base font-semibold text-foreground/70 uppercase tracking-wide mb-3 mt-6 first:mt-0",
      className
    )}>
      {title}
    </h2>
  )
}

export { 
  StartPageCard, 
  StartPageCardHeader, 
  StartPageButtonGrid, 
  SectionHeader,
  startPageCardVariants 
}
