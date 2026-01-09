import { Card } from "@/components/ui/card";
import { ChevronRight, Pill, Shield, HelpCircle, User, Stethoscope, LogOut, MessageSquare, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { FeedbackSheet } from "@/components/Feedback";
import { usePWAInstall } from "@/hooks/usePWAInstall";

interface SettingsOverviewProps {
  onNavigate: (section: 'medications' | 'privacy' | 'help' | 'account' | 'doctors' | 'logout' | 'install') => void;
}

export const SettingsOverview = ({ onNavigate }: SettingsOverviewProps) => {
  const isMobile = useIsMobile();
  const [showFeedback, setShowFeedback] = useState(false);
  const { canShowInstallPrompt, isStandalone } = usePWAInstall();

  // Build sections dynamically based on PWA install state
  const sections = [
    {
      id: 'account' as const,
      icon: User,
      title: 'Kontoeinstellungen',
      description: 'Persönliche Daten und E-Mail-Adresse',
      gradient: 'from-blue-500/10 to-blue-500/5',
    },
    {
      id: 'medications' as const,
      icon: Pill,
      title: 'Medikamente',
      description: 'Medikamente verwalten und Limits festlegen',
      gradient: 'from-primary/10 to-primary/5',
    },
    {
      id: 'doctors' as const,
      icon: Stethoscope,
      title: 'Behandelnde Ärzte',
      description: 'Ärzte-Kontaktdaten hinzufügen und verwalten',
      gradient: 'from-green-500/10 to-green-500/5',
    },
    {
      id: 'privacy' as const,
      icon: Shield,
      title: 'Datenschutz & Sicherheit',
      description: 'Datenschutzeinstellungen und Account-Verwaltung',
      gradient: 'from-secondary/10 to-secondary/5',
    },
    {
      id: 'help' as const,
      icon: HelpCircle,
      title: 'Hilfe & Tutorial',
      description: 'App-Tour wiederholen und Hilfe erhalten',
      gradient: 'from-accent/10 to-accent/5',
    },
    // PWA Install - nur anzeigen wenn iOS Safari und nicht bereits installiert
    ...(canShowInstallPrompt ? [{
      id: 'install' as const,
      icon: Smartphone,
      title: 'Zum Home-Bildschirm',
      description: 'App installieren für schnelleren Zugriff',
      gradient: 'from-cyan-500/10 to-cyan-500/5',
    }] : []),
    // Zeige "Bereits installiert" wenn Standalone
    ...(isStandalone ? [{
      id: 'install' as const,
      icon: Smartphone,
      title: 'App installiert',
      description: 'Die App läuft bereits im Standalone-Modus',
      gradient: 'from-primary/10 to-primary/5',
    }] : []),
    {
      id: 'feedback' as const,
      icon: MessageSquare,
      title: 'Feedback',
      description: 'Verbesserungsvorschläge oder Fehler melden',
      gradient: 'from-violet-500/10 to-violet-500/5',
    },
    {
      id: 'logout' as const,
      icon: LogOut,
      title: 'Abmelden',
      description: 'Von Ihrem Konto abmelden',
      gradient: 'from-destructive/10 to-destructive/5',
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
            onClick={() => {
              if (section.id === 'feedback') {
                setShowFeedback(true);
              } else {
                onNavigate(section.id as any);
              }
            }}
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
      
      {/* Feedback Sheet */}
      <FeedbackSheet open={showFeedback} onOpenChange={setShowFeedback} />
    </div>
  );
};
