import { Card } from "@/components/ui/card";
import { ChevronRight, Pill, Shield, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface SettingsOverviewProps {
  onNavigate: (section: 'medications' | 'privacy') => void;
}

export const SettingsOverview = ({ onNavigate }: SettingsOverviewProps) => {
  const isMobile = useIsMobile();

  const sections = [
    {
      id: 'medications' as const,
      icon: Pill,
      title: 'Medikamente',
      description: 'Medikamente verwalten und Limits festlegen',
      gradient: 'from-primary/10 to-primary/5',
    },
    {
      id: 'privacy' as const,
      icon: Shield,
      title: 'Datenschutz & Sicherheit',
      description: 'Datenschutzeinstellungen und Account-Verwaltung',
      gradient: 'from-secondary/10 to-secondary/5',
    },
  ];

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <Card
            key={section.id}
            className={cn(
              "p-5 cursor-pointer transition-all hover:shadow-lg active:scale-[0.98]",
              "bg-gradient-to-br",
              section.gradient,
              isMobile && "p-4"
            )}
            onClick={() => onNavigate(section.id)}
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "shrink-0 rounded-full bg-background p-3",
                isMobile && "p-2"
              )}>
                <Icon className={cn(
                  "text-foreground",
                  isMobile ? "h-5 w-5" : "h-6 w-6"
                )} />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className={cn(
                  "font-semibold text-foreground mb-1",
                  isMobile ? "text-base" : "text-lg"
                )}>
                  {section.title}
                </h3>
                <p className={cn(
                  "text-muted-foreground",
                  isMobile ? "text-xs" : "text-sm"
                )}>
                  {section.description}
                </p>
              </div>

              <ChevronRight className={cn(
                "shrink-0 text-muted-foreground",
                isMobile ? "h-5 w-5" : "h-6 w-6"
              )} />
            </div>
          </Card>
        );
      })}
    </div>
  );
};
