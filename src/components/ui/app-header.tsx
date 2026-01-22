/**
 * AppHeader - Unified header component for ALL app screens.
 * 
 * LAYOUT RULES (MANDATORY):
 * - Back button: fixed position 16px from left edge, min 44x44 touch target
 * - Title: optically centered relative to screen width (not to remaining space)
 * - Actions: right-aligned; if empty, space is reserved to keep title centered
 * - Back always navigates one level back (or closes modal)
 * 
 * DO NOT override these rules in individual screens.
 */

import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  /** Screen title - displayed centered */
  title: string;
  /** Back handler - always one level back */
  onBack: () => void;
  /** Show spinner on back button (e.g. during save) */
  isBackLoading?: boolean;
  /** Optional action slot (right side) */
  action?: ReactNode;
  /** Stick to top on scroll */
  sticky?: boolean;
  /** Additional className for the container */
  className?: string;
}

export const AppHeader = ({
  title,
  onBack,
  isBackLoading = false,
  action,
  sticky = false,
  className,
}: AppHeaderProps) => {
  return (
    <header
      className={cn(
        // Base layout: fixed height, horizontal padding
        "relative flex items-center h-14 px-4",
        // Sticky behavior
        sticky && "sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border",
        className
      )}
    >
      {/* Back Button - fixed left position */}
      <div className="absolute left-4 flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          disabled={isBackLoading}
          className="h-11 w-11 shrink-0"
          aria-label="Zurück"
        >
          {isBackLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ArrowLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Title - centered relative to full width */}
      <h1 className="flex-1 text-center text-lg font-semibold text-foreground truncate px-14">
        {title}
      </h1>

      {/* Actions - fixed right position */}
      <div className="absolute right-4 flex items-center gap-2">
        {action}
      </div>
    </header>
  );
};

export default AppHeader;
