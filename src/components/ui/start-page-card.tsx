import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const startPageCardVariants = cva(
  "rounded-xl transition-all duration-200 touch-manipulation cursor-pointer select-none shadow-sm relative",
  {
    variants: {
      variant: {
        success: "bg-success/15 text-foreground hover:bg-success/25 border border-success/20",
        quick: "bg-destructive/15 text-foreground hover:bg-destructive/25 border border-destructive/20",
        neutral: "bg-card/80 hover:bg-card border border-border/50",
        voice: "bg-voice/20 text-foreground hover:bg-voice/30 border-2 border-voice/40",
        voiceHighlight: "bg-gradient-to-br from-voice/30 via-voice/20 to-voice/10 text-foreground hover:from-voice/40 hover:via-voice/30 hover:to-voice/20 border-2 border-voice/50 shadow-lg shadow-voice/15",
        voiceActive: "bg-gradient-to-br from-voice/35 via-voice/25 to-voice/15 text-foreground border-2 border-voice/60 shadow-xl shadow-voice/25 ring-2 ring-voice/50",
        warning: "bg-warning/20 text-foreground hover:bg-warning/30 border border-warning/30",
        muted: "bg-muted/30 hover:bg-muted/50 border border-border/30",
      },
      size: {
        default: "p-4",
        large: "p-5",
        small: "p-3",
        hero: "p-5 sm:p-6 min-h-[116px] sm:min-h-[124px]",
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
  iconSize?: "default" | "large"
}

const StartPageCardHeader: React.FC<StartPageCardHeaderProps> = ({
  icon,
  title,
  subtitle,
  className,
  iconClassName,
  iconBgClassName,
  iconSize = "default",
}) => {
  const isLarge = iconSize === "large";
  
  return (
    <div className={cn(
      "flex items-center gap-3 sm:gap-4",
      isLarge ? "min-h-[64px] sm:min-h-[72px]" : "min-h-[52px] sm:min-h-[56px]"
    )}>
      {icon && (
        <div className={cn(
          "rounded-xl flex items-center justify-center flex-shrink-0",
          isLarge ? "w-14 h-14 sm:w-16 sm:h-16" : "w-10 h-10 sm:w-11 sm:h-11",
          iconBgClassName || "bg-background/50"
        )}>
          <span className={cn(
            isLarge ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl",
            iconClassName
          )}>
            {icon}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h3 className={cn("font-semibold text-sm sm:text-base leading-tight break-words line-clamp-2 text-foreground", className)}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs sm:text-sm text-foreground/60 mt-1 leading-snug break-words line-clamp-2">
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
      "text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-5 mt-10 first:mt-0",
      className
    )}>
      {title}
    </h2>
  )
}

// Badge Component for Hero Cards
interface CardBadgeProps {
  text: string
  className?: string
}

const CardBadge: React.FC<CardBadgeProps> = ({ text, className }) => {
  return (
    <span className={cn(
      "absolute top-2 right-2 px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded-full bg-voice/30 text-voice-foreground border border-voice/40",
      className
    )}>
      {text}
    </span>
  )
}

export { 
  StartPageCard, 
  StartPageCardHeader, 
  StartPageButtonGrid, 
  SectionHeader,
  CardBadge,
  startPageCardVariants 
}
