import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const startPageCardVariants = cva(
  "rounded-lg transition-all duration-200 touch-manipulation cursor-pointer",
  {
    variants: {
      variant: {
        success: "bg-green-100 text-green-800 hover:bg-green-200 active:bg-green-300",
        quick: "bg-red-100 text-red-800 hover:bg-red-200 active:bg-red-300",
        neutral: "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300",
        voice: "bg-blue-100 text-blue-900 hover:bg-blue-200 active:bg-blue-300",
        warning: "bg-amber-100 text-amber-900 hover:bg-amber-200 active:bg-amber-300",
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
}

const StartPageCardHeader: React.FC<StartPageCardHeaderProps> = ({
  icon,
  title,
  subtitle,
}) => {
  return (
    <div className="flex items-center space-x-3">
      {icon && (
        <div className="text-2xl flex-shrink-0">
          {icon}
        </div>
      )}
      <div className="flex-1">
        <h3 className="font-semibold text-base sm:text-lg leading-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm opacity-90 mt-1 leading-tight">
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