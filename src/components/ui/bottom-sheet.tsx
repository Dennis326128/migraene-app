import * as React from "react"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  title?: string
  description?: string
  className?: string
  mobileOnly?: boolean
  showHandle?: boolean
}

export function BottomSheet({ 
  open, 
  onOpenChange, 
  children, 
  title, 
  description, 
  className,
  mobileOnly = false,
  showHandle = true
}: BottomSheetProps) {
  const isMobile = useIsMobile()
  
  // Use drawer on mobile, dialog on desktop (unless mobileOnly is true)
  if (isMobile || mobileOnly) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn("max-h-[80vh]", className)}>
          {!showHandle && (
            <div className="mx-auto mt-4 h-1 w-[60px] rounded-full bg-muted opacity-0" />
          )}
          {title && (
            <DrawerHeader className="text-left">
              <DrawerTitle>{title}</DrawerTitle>
              {description && <DrawerDescription>{description}</DrawerDescription>}
            </DrawerHeader>
          )}
          <div className="px-4 pb-4 flex-1 overflow-y-auto">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  // Desktop fallback to dialog
  if (!mobileOnly) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={className}>
          {title && (
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
          )}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return null
}

// Quick action sheet for common mobile patterns
interface QuickActionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  actions: Array<{
    label: string
    icon?: React.ReactNode
    onClick: () => void
    variant?: "default" | "destructive" | "secondary"
    disabled?: boolean
  }>
}

export function QuickActionSheet({ open, onOpenChange, title, actions }: QuickActionSheetProps) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} mobileOnly>
      <div className="space-y-2">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => {
              action.onClick()
              onOpenChange(false)
            }}
            disabled={action.disabled}
            className={cn(
              "w-full flex items-center gap-3 p-4 text-left rounded-lg transition-colors touch-manipulation min-h-[56px]",
              action.variant === "destructive" 
                ? "text-destructive hover:bg-destructive/10" 
                : action.variant === "secondary"
                ? "text-muted-foreground hover:bg-muted"
                : "text-foreground hover:bg-accent",
              action.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {action.icon && <span className="text-xl">{action.icon}</span>}
            <span className="font-medium">{action.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}