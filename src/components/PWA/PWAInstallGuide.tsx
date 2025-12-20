import { Share, Plus, SquarePlus, Check, WifiOff, Zap, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { cn } from '@/lib/utils';

interface InstallStep {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const installSteps: InstallStep[] = [
  {
    step: 1,
    icon: <Share className="h-6 w-6" />,
    title: 'Teilen antippen',
    description: 'Tippe auf das Teilen-Symbol unten in Safari',
  },
  {
    step: 2,
    icon: <SquarePlus className="h-6 w-6" />,
    title: '"Zum Home-Bildschirm"',
    description: 'Scrolle nach unten und wähle diese Option',
  },
  {
    step: 3,
    icon: <Plus className="h-6 w-6" />,
    title: '"Hinzufügen"',
    description: 'Bestätige mit "Hinzufügen" oben rechts',
  },
];

const benefits = [
  { icon: <Zap className="h-4 w-4" />, text: 'Schneller Zugriff' },
  { icon: <Download className="h-4 w-4" />, text: 'Kein App Store nötig' },
  { icon: <WifiOff className="h-4 w-4" />, text: 'Offline verfügbar' },
];

export function PWAInstallGuide() {
  const { isIOSSafari, isStandalone, isIOS } = usePWAInstall();

  // Bereits installiert
  if (isStandalone) {
    return (
      <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="flex items-center gap-3 text-primary">
          <Check className="h-6 w-6" />
          <span className="font-medium">App bereits auf dem Home-Bildschirm installiert</span>
        </div>
      </Card>
    );
  }

  // Nicht iOS Safari
  if (!isIOSSafari) {
    return (
      <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-amber-500/5">
        <div className="space-y-3">
          <p className="text-foreground font-medium">
            Installation nur in Safari verfügbar
          </p>
          <p className="text-muted-foreground text-sm">
            {isIOS 
              ? 'Bitte öffne diese Seite in Safari, um die App zum Home-Bildschirm hinzuzufügen.'
              : 'Diese Funktion ist für iPhone und iPad in Safari verfügbar.'
            }
          </p>
        </div>
      </Card>
    );
  }

  // iOS Safari - zeige Install-Guide
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-foreground">
          Zum Home-Bildschirm hinzufügen
        </h2>
        <p className="text-muted-foreground text-sm">
          Füge die App deinem Home-Bildschirm hinzu für schnellen Zugriff
        </p>
      </div>

      {/* Vorteile */}
      <div className="flex justify-center gap-4 flex-wrap">
        {benefits.map((benefit, i) => (
          <div 
            key={i}
            className="flex items-center gap-2 text-sm text-muted-foreground bg-card/50 px-3 py-1.5 rounded-full"
          >
            <span className="text-primary">{benefit.icon}</span>
            <span>{benefit.text}</span>
          </div>
        ))}
      </div>

      {/* Schritte */}
      <div className="space-y-3">
        {installSteps.map((item) => (
          <Card 
            key={item.step}
            className="p-4 bg-card border-border"
          >
            <div className="flex items-center gap-4">
              {/* Step Number */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-semibold text-sm">{item.step}</span>
              </div>
              
              {/* Icon */}
              <div className="flex-shrink-0 text-primary">
                {item.icon}
              </div>
              
              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Hinweis */}
      <p className="text-xs text-muted-foreground text-center">
        Nach der Installation öffnet sich die App im Vollbildmodus ohne Browser-Leiste.
      </p>
    </div>
  );
}
