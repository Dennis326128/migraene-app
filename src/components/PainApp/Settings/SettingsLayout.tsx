import { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
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
        <PageHeader title={title} onBack={onBack} />
        {children}
      </div>
    </div>
  );
};
