import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface EditDialogLayoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Force mobile layout even on desktop (for testing) */
  forceMobile?: boolean;
  /** Loading state - shows skeleton placeholders */
  isLoading?: boolean;
}

/**
 * Responsive Edit Dialog Layout
 * - Desktop: Wide dialog (max-w-5xl) with 2-column layout support
 * - Mobile: Fullscreen sheet with sticky header/footer
 * 
 * Usage:
 * <EditDialogLayout
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Medikament bearbeiten"
 *   description="Stammdaten anpassen"
 *   footer={<FooterButtons />}
 * >
 *   <YourFormContent />
 * </EditDialogLayout>
 */
export function EditDialogLayout({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  forceMobile,
  isLoading,
}: EditDialogLayoutProps) {
  const isMobileDevice = useIsMobile();
  const isMobile = forceMobile ?? isMobileDevice;

  // Loading skeleton
  const LoadingSkeleton = () => (
    <div className="space-y-6 p-4 animate-pulse">
      <div className="h-10 bg-muted rounded-lg w-3/4" />
      <div className="h-10 bg-muted rounded-lg w-1/2" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-10 bg-muted rounded-lg" />
        <div className="h-10 bg-muted rounded-lg" />
      </div>
      <div className="h-24 bg-muted rounded-lg" />
      <div className="h-10 bg-muted rounded-lg w-2/3" />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[95vh] max-h-[95vh] flex flex-col">
          {/* Sticky Header */}
          <DrawerHeader className="shrink-0 border-b bg-background px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
                {description && (
                  <DrawerDescription className="text-sm text-muted-foreground mt-0.5">
                    {description}
                  </DrawerDescription>
                )}
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                  <X className="h-5 w-5" />
                  <span className="sr-only">Schließen</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          {/* Scrollable Content */}
          <div className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden modern-scrollbar px-4 py-4",
            className
          )}>
            {isLoading ? <LoadingSkeleton /> : children}
          </div>

          {/* Sticky Footer */}
          {footer && (
            <div className="shrink-0 border-t bg-background px-4 py-3 safe-area-inset-bottom">
              {footer}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: Wide dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          // Wide dialog on desktop
          "max-w-5xl w-[95vw] max-h-[90vh] flex flex-col p-0",
          "overflow-hidden"
        )}
      >
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Scrollable Content */}
        <div className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden modern-scrollbar px-6 py-6",
          className
        )}>
          {isLoading ? <LoadingSkeleton /> : children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t px-6 py-4 bg-background">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Two-column layout wrapper for desktop forms
 * Renders as single column on mobile
 */
interface TwoColumnLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function TwoColumnLayout({ children, className }: TwoColumnLayoutProps) {
  return (
    <div className={cn(
      "grid gap-6",
      // Single column on mobile, two columns on desktop
      "lg:grid-cols-2",
      className
    )}>
      {children}
    </div>
  );
}

/**
 * Form section with optional title and description
 */
interface FormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && <h3 className="text-base font-medium">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Standard footer buttons layout
 */
interface DialogFooterButtonsProps {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
  isDisabled?: boolean;
  saveButtonContent?: React.ReactNode;
}

export function DialogFooterButtons({
  onCancel,
  onSave,
  saveLabel = "Speichern",
  cancelLabel = "Abbrechen",
  isSaving,
  isDisabled,
  saveButtonContent,
}: DialogFooterButtonsProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn(
      "flex gap-3",
      isMobile ? "flex-col-reverse" : "justify-end"
    )}>
      <Button 
        variant="outline" 
        onClick={onCancel}
        className={cn(isMobile && "w-full h-12")}
      >
        {cancelLabel}
      </Button>
      <Button 
        onClick={onSave} 
        disabled={isSaving || isDisabled}
        className={cn(isMobile && "w-full h-12")}
      >
        {saveButtonContent || saveLabel}
      </Button>
    </div>
  );
}
