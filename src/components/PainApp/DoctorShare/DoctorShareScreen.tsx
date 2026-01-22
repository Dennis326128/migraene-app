/**
 * DoctorShareScreen
 * "Mit Arzt teilen" - 24h-Freigabe-Fenster UX
 * 
 * Zustände:
 * A) Keine aktive Freigabe → Auto-Start beim Öffnen (sofern nicht heute beendet)
 * B) Freigabe aktiv → Code + "gültig bis" + "Freigabe beenden"
 * C) Heute bewusst beendet → Button "Für Arzt freigeben (24h)"
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Shield, ShieldOff, Clock } from "lucide-react";
import { toast } from "sonner";
import { 
  useDoctorShareStatus, 
  useActivateDoctorShare, 
  useRevokeDoctorShare 
} from "@/features/doctor-share";
import { AppHeader } from "@/components/ui/app-header";

interface DoctorShareScreenProps {
  onBack: () => void;
}

// Formatiert das Ablaufdatum benutzerfreundlich
function formatActiveUntil(dateStr: string | null): string {
  if (!dateStr) return "";
  
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  // Deutsches Datumsformat
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  };
  const formatted = date.toLocaleDateString("de-DE", options);
  
  if (diffHours > 0) {
    return `${formatted} (noch ${diffHours}h ${diffMinutes}min)`;
  } else if (diffMinutes > 0) {
    return `${formatted} (noch ${diffMinutes} Minuten)`;
  }
  return formatted;
}

export const DoctorShareScreen: React.FC<DoctorShareScreenProps> = ({ onBack }) => {
  const { data: shareStatus, isLoading, error, refetch } = useDoctorShareStatus();
  const activateMutation = useActivateDoctorShare();
  const revokeMutation = useRevokeDoctorShare();
  
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [autoActivated, setAutoActivated] = useState(false);

  // Auto-Aktivierung: Wenn keine aktive Freigabe und nicht heute beendet
  useEffect(() => {
    if (
      shareStatus && 
      !shareStatus.is_share_active && 
      !shareStatus.was_revoked_today &&
      !autoActivated &&
      !activateMutation.isPending
    ) {
      setAutoActivated(true);
      activateMutation.mutate(undefined, {
        onSuccess: () => {
          // Stille Aktivierung, kein Toast
          refetch();
        },
        onError: (err) => {
          console.error("Auto-Aktivierung fehlgeschlagen:", err);
        },
      });
    }
  }, [shareStatus, autoActivated, activateMutation, refetch]);

  // Code kopieren
  const handleCopyCode = async () => {
    if (!shareStatus) return;
    try {
      await navigator.clipboard.writeText(shareStatus.code_display);
      setCopied(true);
      toast.success("Code kopiert");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  // Freigabe manuell aktivieren (nach bewusstem Beenden)
  const handleActivate = () => {
    activateMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Freigabe aktiviert für 24 Stunden");
        refetch();
      },
      onError: () => {
        toast.error("Freigabe konnte nicht aktiviert werden");
      },
    });
  };

  // Freigabe beenden
  const handleRevoke = () => {
    revokeMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Freigabe beendet");
        refetch();
      },
      onError: () => {
        toast.error("Freigabe konnte nicht beendet werden");
      },
    });
  };

  // Retry bei Fehler
  const handleRetry = async () => {
    setIsRetrying(true);
    await refetch();
    setIsRetrying(false);
  };

  // Prüfe Freigabe-Status
  const isShareActive = shareStatus?.is_share_active ?? false;
  const wasRevokedToday = shareStatus?.was_revoked_today ?? false;
  const isPending = activateMutation.isPending || revokeMutation.isPending;

  return (
    <div className="flex flex-col h-full bg-background">
      <AppHeader title="Mit Arzt teilen" onBack={onBack} sticky />

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-md mx-auto space-y-6 pt-4">
          
          {/* Lade-Zustand */}
          {(isLoading || (activateMutation.isPending && !shareStatus?.is_share_active)) && (
            <div className="py-12 text-center">
              <div className="animate-pulse space-y-4">
                <div className="h-16 bg-muted/30 rounded-xl max-w-[200px] mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {activateMutation.isPending ? "Freigabe wird aktiviert…" : "Code wird vorbereitet…"}
                </p>
              </div>
            </div>
          )}

          {/* Fehler-Zustand */}
          {!isLoading && error && (
            <div className="py-12 text-center space-y-4">
              <p className="text-muted-foreground">
                Der Code kann gerade nicht angezeigt werden.
              </p>
              <Button 
                variant="outline" 
                onClick={handleRetry}
                disabled={isRetrying}
                className="gap-2"
              >
                {isRetrying ? "Wird geladen…" : "Erneut versuchen"}
              </Button>
            </div>
          )}

          {/* Zustand B: Freigabe AKTIV */}
          {!isLoading && !error && shareStatus && isShareActive && (
            <div className="space-y-6">
              {/* Status-Header */}
              <div className="flex items-center justify-center gap-2 text-primary">
                <Shield className="w-5 h-5" />
                <span className="font-medium">Freigabe aktiv</span>
              </div>

              {/* Der Code */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center">
                <div className="font-mono text-4xl font-bold tracking-widest text-primary">
                  {shareStatus.code_display}
                </div>
              </div>

              {/* Gültig bis */}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Gültig bis {formatActiveUntil(shareStatus.share_active_until)}</span>
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
              <div className="space-y-2 text-sm text-muted-foreground text-center">
                <p>
                  Ihr Arzt kann Ihre Daten mit diesem Code einsehen.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Der Code bleibt immer gleich.
                </p>
              </div>

              {/* Freigabe beenden */}
              <div className="pt-4 border-t">
                <Button
                  onClick={handleRevoke}
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-destructive gap-2"
                  disabled={isPending}
                >
                  <ShieldOff className="w-4 h-4" />
                  {revokeMutation.isPending ? "Wird beendet…" : "Freigabe jetzt beenden"}
                </Button>
              </div>
            </div>
          )}

          {/* Zustand C: Heute bewusst beendet (oder noch nie aktiviert nach Revoke) */}
          {!isLoading && !error && shareStatus && !isShareActive && !activateMutation.isPending && (
            <div className="space-y-6">
              {/* Status-Header */}
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <ShieldOff className="w-5 h-5" />
                <span className="font-medium">Freigabe beendet</span>
              </div>

              {/* Der Code (ausgegraut) */}
              <div className="bg-muted/30 rounded-xl p-6 text-center">
                <div className="font-mono text-4xl font-bold tracking-widest text-muted-foreground/50">
                  {shareStatus.code_display}
                </div>
              </div>

              {/* Hinweis */}
              <p className="text-sm text-muted-foreground text-center">
                {wasRevokedToday 
                  ? "Sie haben die Freigabe heute beendet. Wenn Sie möchten, können Sie erneut für 24 Stunden freigeben."
                  : "Ihre Daten sind derzeit nicht freigegeben. Aktivieren Sie die Freigabe, um Ihrem Arzt Zugang zu gewähren."
                }
              </p>

              {/* Aktivieren-Button */}
              <Button
                onClick={handleActivate}
                size="lg"
                className="w-full gap-2"
                disabled={isPending}
              >
                <Shield className="w-5 h-5" />
                {activateMutation.isPending ? "Wird aktiviert…" : "Für Arzt freigeben (24 h)"}
              </Button>

              {/* Code-Hinweis */}
              <p className="text-xs text-muted-foreground/70 text-center">
                Der Code bleibt immer gleich.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorShareScreen;
