/**
 * DoctorShareScreen
 * Zeigt den permanenten, festen Arzt-Code des Nutzers an
 * - Kein Erstellen, kein Widerrufen, kein Ablauf
 * - Get-or-create Logik im Backend
 * - Maximale Einfachheit und ruhiges Design
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { usePermanentDoctorCode } from "@/features/doctor-share";

interface DoctorShareScreenProps {
  onBack: () => void;
}

export const DoctorShareScreen: React.FC<DoctorShareScreenProps> = ({ onBack }) => {
  const { data: doctorCode, isLoading, error } = usePermanentDoctorCode();
  const [copied, setCopied] = useState(false);

  // URL für Arzt
  const getDoctorUrl = () => {
    const origin = window.location.origin;
    // Ersetze Preview-URLs durch die Published URL
    if (origin.includes('-preview--')) {
      return 'https://migraene-app.lovable.app/doctor';
    }
    return `${origin}/doctor`;
  };

  // Code kopieren
  const handleCopyCode = async () => {
    if (!doctorCode) return;
    try {
      await navigator.clipboard.writeText(doctorCode.code_display);
      setCopied(true);
      toast.success("Code kopiert");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header - KEINE border-b (weiße Linie entfernt) */}
      <div className="flex items-center gap-3 p-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">Mit Arzt teilen</h1>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-md mx-auto space-y-8 pt-8">
          {/* Überschrift */}
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground">Ihr Arzt-Code</h2>
          </div>

          {/* Lade-Zustand: Ruhig und neutral */}
          {isLoading && (
            <div className="py-12 text-center">
              <div className="animate-pulse space-y-4">
                <div className="h-16 bg-muted/30 rounded-xl max-w-[200px] mx-auto" />
                <p className="text-sm text-muted-foreground">Code wird vorbereitet…</p>
              </div>
            </div>
          )}

          {/* Fehler-Zustand: Sanft, keine roten Elemente */}
          {!isLoading && error && (
            <div className="py-12 text-center space-y-4">
              <p className="text-muted-foreground">
                Der Code kann gerade nicht angezeigt werden.
              </p>
              <p className="text-sm text-muted-foreground/70">
                Bitte später erneut öffnen.
              </p>
            </div>
          )}

          {/* Code erfolgreich geladen */}
          {!isLoading && !error && doctorCode && (
            <div className="space-y-6">
              {/* Der Code - groß und lesbar */}
              <div className="bg-muted/50 rounded-xl p-6 text-center">
                <div className="font-mono text-4xl font-bold tracking-widest text-primary">
                  {doctorCode.code_display}
                </div>
              </div>

              {/* Kopieren-Button */}
              <Button
                onClick={handleCopyCode}
                variant="outline"
                size="lg"
                className="w-full gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Kopiert
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Code kopieren
                  </>
                )}
              </Button>

              {/* Hinweise - ruhig und zurückhaltend */}
              <div className="space-y-3 text-sm text-muted-foreground text-center pt-2">
                <p>
                  Diesen Code können Sie Ihrem Arzt vorlesen oder zeigen.
                </p>
                <p className="text-muted-foreground/80">
                  Auch zur Ansicht Ihrer Daten am Computer geeignet.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorShareScreen;