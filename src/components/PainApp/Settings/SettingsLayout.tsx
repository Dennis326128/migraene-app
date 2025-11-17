import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface SettingsLayoutProps {
  title: string;
  onBack: () => void;
  children: ReactNode;
}

export const SettingsLayout = ({ title, onBack, children }: SettingsLayoutProps) => {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className={cn("max-w-4xl mx-auto", isMobile ? "p-4" : "p-6")}>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size={isMobile ? "sm" : "default"}
            onClick={onBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className={cn(
            "font-bold text-foreground",
            isMobile ? "text-xl" : "text-2xl"
          )}>
            {title}
          </h1>
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
};
