import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { X, Shield, Cookie, BarChart } from 'lucide-react';

interface CookiePreferences {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
}

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true, // always required
    functional: false,
    analytics: false,
  });

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    const allAccepted = { necessary: true, functional: true, analytics: true };
    saveCookiePreferences(allAccepted);
  };

  const handleAcceptSelected = () => {
    saveCookiePreferences(preferences);
  };

  const handleRejectAll = () => {
    const minimal = { necessary: true, functional: false, analytics: false };
    saveCookiePreferences(minimal);
  };

  const saveCookiePreferences = (prefs: CookiePreferences) => {
    localStorage.setItem('cookie-consent', JSON.stringify({
      preferences: prefs,
      timestamp: new Date().toISOString(),
      version: '1.0'
    }));
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
      <Card className="border-2 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Datenschutz & Cookies</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVisible(false)}
              aria-label="Cookie-Banner schließen"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wir verwenden Cookies und lokale Speicherung für die beste Erfahrung.
            Lesen Sie unsere{' '}
            <button 
              className="text-primary underline hover:no-underline"
              onClick={() => window.location.href = '/privacy'}
            >
              Datenschutzerklärung
            </button>
            ,{' '}
            <button 
              className="text-primary underline hover:no-underline"
              onClick={() => window.location.href = '/terms'}
            >
              AGB
            </button>
            {' '}und{' '}
            <button 
              className="text-primary underline hover:no-underline"
              onClick={() => window.location.href = '/imprint'}
            >
              Impressum
            </button>
            .
          </p>

          {showDetails && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="necessary" 
                  checked={true} 
                  disabled 
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="necessary" className="text-sm font-medium">
                    <Shield className="inline h-3 w-3 mr-1" />
                    Notwendige Cookies
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Erforderlich für grundlegende Funktionen und Sicherheit
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="functional" 
                  checked={preferences.functional}
                  onCheckedChange={(checked) => 
                    setPreferences(prev => ({ ...prev, functional: !!checked }))}
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="functional" className="text-sm font-medium">
                    <Cookie className="inline h-3 w-3 mr-1" />
                    Funktionale Cookies
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Verbessern die Benutzerfreundlichkeit und Personalisierung
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="analytics" 
                  checked={preferences.analytics}
                  onCheckedChange={(checked) => 
                    setPreferences(prev => ({ ...prev, analytics: !!checked }))}
                />
                <div className="grid gap-1.5 leading-none">
                  <label htmlFor="analytics" className="text-sm font-medium">
                    <BarChart className="inline h-3 w-3 mr-1" />
                    Analytische Cookies
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Helfen uns zu verstehen, wie die App genutzt wird
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {!showDetails ? (
              <>
                <Button onClick={handleAcceptAll} className="w-full">
                  Alle akzeptieren
                </Button>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={handleRejectAll}
                    className="flex-1"
                  >
                    Nur notwendige
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowDetails(true)}
                    className="flex-1"
                  >
                    Anpassen
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button onClick={handleAcceptSelected} className="w-full">
                  Auswahl speichern
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowDetails(false)}
                  className="w-full"
                >
                  Zurück
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}