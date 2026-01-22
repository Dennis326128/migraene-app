/**
 * DoctorShareScreen
 * "Mit Arzt teilen" - Minimalistisches 24h-Freigabe-Fenster
 * 
 * Zustände:
 * A) Keine aktive Freigabe + NICHT heute revoked → Auto-Aktivierung
 * B) Freigabe aktiv → Code + Status + "Freigabe beenden"
 * C) Heute manuell beendet → Button "Für 24h freigeben"
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { 
  useDoctorShareStatus, 
  useActivateDoctorShare, 
  useRevokeDoctorShare 
} from "@/features/doctor-share";
import { AppHeader } from "@/components/ui/app-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DoctorShareScreenProps {
  onBack: () => void;
}

// Formatiert das Ablaufdatum benutzerfreundlich: "morgen 14:28 Uhr" oder "Do. 14:28 Uhr"
function formatActiveUntil(dateStr: string | null): string {
  if (!dateStr) return "";
  
  const date = new Date(dateStr);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  const timeStr = date.toLocaleTimeString("de-DE", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });
  
  if (isToday) {
    return `heute ${timeStr} Uhr`;
  } else if (isTomorrow) {
    return `morgen ${timeStr} Uhr`;
  } else {
    const dayStr = date.toLocaleDateString("de-DE", { weekday: "short" });
    return `${dayStr} ${timeStr} Uhr`;
  }
}

export const DoctorShareScreen: React.FC<DoctorShareScreenProps> = ({ onBack }) => {
  const { data: shareStatus, isLoading, error, refetch } = useDoctorShareStatus();
  const activateMutation = useActivateDoctorShare();
  const revokeMutation = useRevokeDoctorShare();
  
  const [copied, setCopied] = useState(false);
  const [autoActivated, setAutoActivated] = useState(false);

  // Zustand A: Auto-Aktivierung wenn keine aktive Freigabe UND nicht heute beendet
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
        onSuccess: () => refetch(),
        onError: (err) => console.error("Auto-Aktivierung fehlgeschlagen:", err),
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

  // Zustand C: Manuelle Aktivierung (nach Revoke am selben Tag)
  const handleActivate = () => {
    activateMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Freigabe aktiviert");
        refetch();
      },
      onError: () => toast.error("Freigabe konnte nicht aktiviert werden"),
    });
  };

  // Freigabe beenden
  const handleRevoke = () => {
    revokeMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Freigabe beendet");
        refetch();
      },
      onError: () => toast.error("Freigabe konnte nicht beendet werden"),
    });
  };

  const isShareActive = shareStatus?.is_share_active ?? false;
  const isPending = activateMutation.isPending || revokeMutation.isPending;

  return (
    <div className="flex flex-col h-full bg-background">
      <AppHeader title="Mit Arzt teilen" onBack={onBack} sticky />

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-md mx-auto pt-8">
          
          {/* Lade-Zustand (inkl. Auto-Aktivierung) */}
          {(isLoading || (activateMutation.isPending && !shareStatus?.is_share_active)) && (
            <div className="py-16 text-center">
              <div className="animate-pulse space-y-4">
                <div className="h-12 bg-muted/30 rounded-lg max-w-[180px] mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Code wird vorbereitet…
                </p>
              </div>
            </div>
          )}

          {/* Fehler-Zustand */}
          {!isLoading && error && (
            <div className="py-16 text-center space-y-4">
              <p className="text-muted-foreground">
                Der Code kann gerade nicht angezeigt werden.
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* Zustand B: Freigabe AKTIV */}
          {!isLoading && !error && shareStatus && isShareActive && (
            <div className="flex flex-col items-center space-y-8">
              {/* Der Code - in grünlich getöntem Container */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl px-8 py-6">
                <div className="font-mono text-4xl font-bold tracking-widest text-foreground text-center">
                  {shareStatus.code_display}
                </div>
              </div>

              {/* Zeitinformation - klein, ruhig */}
              <p className="text-sm text-muted-foreground">
                Zugriff möglich bis {formatActiveUntil(shareStatus.share_active_until)}
              </p>

              {/* Aktionen - dezent */}
              <div className="flex flex-col items-center gap-4 pt-4">
                <Button
                  onClick={handleCopyCode}
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Kopiert
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Code kopieren
                    </>
                  )}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button 
                      className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      disabled={isPending}
                    >
                      Freigabe beenden
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Freigabe beenden?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Der Zugriff auf Ihre Daten wird sofort beendet. Sie können die Freigabe jederzeit erneut starten.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRevoke}>
                        Beenden
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}

          {/* Zustand C: Freigabe INAKTIV (heute beendet oder abgelaufen) */}
          {!isLoading && !error && shareStatus && !isShareActive && !activateMutation.isPending && (
            <div className="flex flex-col items-center space-y-8">
              {/* Der Code - ausgegraut */}
              <div className="font-mono text-4xl font-bold tracking-widest text-muted-foreground/40">
                {shareStatus.code_display}
              </div>

              {/* Status */}
              <p className="text-sm text-muted-foreground">
                Zugriff nicht aktiv
              </p>

              {/* Aktivieren-Button */}
              <Button
                onClick={handleActivate}
                variant="outline"
                size="sm"
                disabled={isPending}
              >
                {activateMutation.isPending ? "Wird aktiviert…" : "Für 24 Stunden freigeben"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorShareScreen;
