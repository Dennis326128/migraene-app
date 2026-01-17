import { Card } from "@/components/ui/card";
import { ChevronRight, Pill, Shield, HelpCircle, User, Stethoscope, LogOut, MessageSquare, Smartphone, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FeedbackSheet } from "@/components/Feedback";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useLanguage } from "@/hooks/useLanguage";
import { LanguageModal } from "./LanguageModal";

interface SettingsOverviewProps {
  onNavigate: (section: 'medications' | 'privacy' | 'help' | 'account' | 'doctors' | 'logout' | 'install') => void;
}

export const SettingsOverview = ({ onNavigate }: SettingsOverviewProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [showFeedback, setShowFeedback] = useState(false);
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  const { canShowInstallPrompt, isStandalone } = usePWAInstall();
  const { currentLanguage, languageNames } = useLanguage();

  // Build sections dynamically based on PWA install state
  const sections = [
    {
      id: 'account' as const,
      icon: User,
      title: 'Persönliche Daten',
      gradient: 'from-blue-500/10 to-blue-500/5',
    },
    {
      id: 'doctors' as const,
      icon: Stethoscope,
      title: 'Behandelnde Ärzte',
      gradient: 'from-green-500/10 to-green-500/5',
    },
    {
      id: 'medications' as const,
      icon: Pill,
      title: 'Medikamente',
      gradient: 'from-primary/10 to-primary/5',
    },
    {
      id: 'privacy' as const,
      icon: Shield,
      title: 'Datenschutz & Sicherheit',
      gradient: 'from-secondary/10 to-secondary/5',
    },
    {
      id: 'help' as const,
      icon: HelpCircle,
      title: 'Hilfe & Tutorial',
      gradient: 'from-accent/10 to-accent/5',
    },
    // PWA Install - nur anzeigen wenn iOS Safari und nicht bereits installiert
    ...(canShowInstallPrompt ? [{
      id: 'install' as const,
      icon: Smartphone,
      title: 'Zum Home-Bildschirm',
      gradient: 'from-cyan-500/10 to-cyan-500/5',
    }] : []),
    // Zeige "Bereits installiert" wenn Standalone
    ...(isStandalone ? [{
      id: 'install' as const,
      icon: Smartphone,
      title: 'App installiert',
      gradient: 'from-primary/10 to-primary/5',
    }] : []),
    {
      id: 'feedback' as const,
      icon: MessageSquare,
      title: 'Feedback',
      gradient: 'from-violet-500/10 to-violet-500/5',
    },
    {
      id: 'logout' as const,
      icon: LogOut,
      title: 'Abmelden',
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
                  "font-semibold text-foreground",
                  isMobile ? "text-base" : "text-lg"
                )}>
                  {section.title}
                </h3>
              </div>

              <ChevronRight className={cn(
                "shrink-0 text-muted-foreground",
                isMobile ? "h-5 w-5" : "h-6 w-6"
              )} />
            </div>
          </Card>
        );
      })}

      {/* Language Row - Special handling with bottom sheet */}
      <Card
        className={cn(
          "p-5 cursor-pointer transition-all hover:shadow-lg active:scale-[0.98]",
          "bg-gradient-to-br from-indigo-500/10 to-indigo-500/5",
          isMobile && "p-4"
        )}
        onClick={() => setShowLanguageSheet(true)}
      >
        <div className="flex items-center gap-4">
          <div className={cn(
            "shrink-0 rounded-full bg-background p-3",
            isMobile && "p-2"
          )}>
            <Globe className={cn(
              "text-foreground",
              isMobile ? "h-5 w-5" : "h-6 w-6"
            )} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-semibold text-foreground",
              isMobile ? "text-base" : "text-lg"
            )}>
              {t('settings.language')}
            </h3>
          </div>

          <span className="text-sm text-muted-foreground mr-1">
            {languageNames[currentLanguage]}
          </span>
          <ChevronRight className={cn(
            "shrink-0 text-muted-foreground",
            isMobile ? "h-5 w-5" : "h-6 w-6"
          )} />
        </div>
      </Card>
      
      {/* Feedback Sheet */}
      <FeedbackSheet open={showFeedback} onOpenChange={setShowFeedback} />
      
      {/* Language Modal */}
      <LanguageModal open={showLanguageSheet} onOpenChange={setShowLanguageSheet} />
    </div>
  );
};
