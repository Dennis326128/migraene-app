import { ReactNode } from "react";
import { BackButton } from "@/components/ui/navigation-buttons";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface PageHeaderProps {
  title: string;
  onBack: () => void;
  isBackLoading?: boolean;
  sticky?: boolean;
  action?: ReactNode;
  className?: string;
}

export const PageHeader = ({
  title,
  onBack,
  isBackLoading = false,
  sticky = false,
  action,
  className
}: PageHeaderProps) => {
  const isMobile = useIsMobile();
  
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        isMobile ? "p-4" : "p-6",
        sticky && "sticky top-0 z-10 bg-background border-b border-border",
        !sticky && "mb-6",
        className
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <BackButton 
          onClick={onBack} 
          isLoading={isBackLoading}
        />
        <h1 className={cn(
          "font-bold text-foreground truncate",
          isMobile ? "text-xl" : "text-2xl"
        )}>
          {title}
        </h1>
      </div>
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  );
};
