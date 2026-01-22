/**
 * DoctorShareScreen
 * Zeigt den permanenten, festen Arzt-Code des Nutzers an
 * - Kein Erstellen, kein Widerrufen, kein Ablauf
 * - Maximale Einfachheit
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
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
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

          {/* Code-Anzeige */}
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              Lade...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-destructive">
              Fehler beim Laden des Codes
            </div>
          ) : doctorCode ? (
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

              {/* Hinweise */}
              <div className="space-y-3 text-sm text-muted-foreground text-center">
                <p>
                  Diesen Code können Sie Ihrem Arzt vorlesen oder zeigen.
                </p>
                <p>
                  Ihr Arzt gibt den Code unter{" "}
                  <span className="font-medium text-foreground">
                    {getDoctorUrl()}
                  </span>{" "}
                  ein.
                </p>
              </div>

              {/* Sekundärer Hinweis */}
              <p className="text-xs text-muted-foreground/70 text-center pt-4">
                Der Code ist fest und ändert sich nicht.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default DoctorShareScreen;
