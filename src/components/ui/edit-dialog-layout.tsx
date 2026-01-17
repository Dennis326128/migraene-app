/**
 * Edit Dialog Layout Components
 * 
 * Reusable layout for edit dialogs with proper mobile optimization.
 */

import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";

interface EditDialogLayoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

export function EditDialogLayout({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  isLoading,
}: EditDialogLayoutProps) {
  const isMobile = useIsMobile();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          isMobile && "max-w-[95vw] p-4",
          className
        )}
      >
        <DialogHeader className={cn(isMobile && "pb-2")}>
          <DialogTitle className={cn(isMobile && "text-lg")}>
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className={cn(isMobile && "text-sm")}>
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        
        <div className={cn(
          "space-y-4",
          isMobile && "space-y-3"
        )}>
          {children}
        </div>
        
        {footer && (
          <div className={cn(
            "mt-6 pt-4 border-t",
            isMobile && "mt-4 pt-3"
          )}>
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Common input field wrapper
interface EditFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}

export function EditField({ label, children, className, required }: EditFieldProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn("space-y-2", className)}>
      <label className={cn(
        "text-sm font-medium text-foreground",
        isMobile && "text-xs"
      )}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

// Two-column layout for forms
interface EditFieldRowProps {
  children: React.ReactNode;
  className?: string;
}

export function EditFieldRow({ children, className }: EditFieldRowProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn(
      "grid gap-4",
      isMobile ? "grid-cols-1 gap-3" : "grid-cols-2",
      className
    )}>
      {children}
    </div>
  );
}

// Section divider
interface EditSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function EditSection({ title, children, className }: EditSectionProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn("space-y-3", className)}>
      {title && (
        <h4 className={cn(
          "text-sm font-semibold text-muted-foreground uppercase tracking-wide",
          isMobile && "text-xs"
        )}>
          {title}
        </h4>
      )}
      {children}
    </div>
  );
}

// Action buttons for dialogs
interface EditActionsProps {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
  isDisabled?: boolean;
}

export function EditActions({ 
  onCancel, 
  onSave, 
  saveLabel, 
  cancelLabel,
  isSaving,
  isDisabled 
}: EditActionsProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  
  const displaySaveLabel = saveLabel ?? t('common.save');
  const displayCancelLabel = cancelLabel ?? t('common.cancel');
  
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
        {displayCancelLabel}
      </Button>
      <Button 
        onClick={onSave} 
        disabled={isSaving || isDisabled}
        className={cn(isMobile && "w-full h-12")}
      >
        {isSaving ? t('common.saving') : displaySaveLabel}
      </Button>
    </div>
  );
}

// Full-width mobile button
interface MobileButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  disabled?: boolean;
  className?: string;
}

export function MobileButton({ 
  children, 
  onClick, 
  variant = "default",
  disabled,
  className 
}: MobileButtonProps) {
  const isMobile = useIsMobile();
  
  return (
    <Button
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        isMobile && "w-full h-12",
        className
      )}
    >
      {children}
    </Button>
  );
}

// Dialog Footer Buttons (legacy support)
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
  saveLabel,
  cancelLabel,
  isSaving,
  isDisabled,
  saveButtonContent,
}: DialogFooterButtonsProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  
  const displaySaveLabel = saveLabel ?? t('common.save');
  const displayCancelLabel = cancelLabel ?? t('common.cancel');
  
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
        {displayCancelLabel}
      </Button>
      <Button 
        onClick={onSave} 
        disabled={isSaving || isDisabled}
        className={cn(isMobile && "w-full h-12")}
      >
        {saveButtonContent || displaySaveLabel}
      </Button>
    </div>
  );
}