/**
 * DoctorShareScreen
 * "Mit Arzt teilen" - Vollständiger Flow mit Settings und Code-Anzeige
 * 
 * Zustände:
 * A) Keine aktive Freigabe → Dialog zum Einrichten
 * B) Freigabe aktiv → Code + Status + "Freigabe beenden"
 * C) Heute manuell beendet → Button "Für 24h freigeben"
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink } from "lucide-react";
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
import DoctorShareDialog from "./DoctorShareDialog";

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
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [justCreatedCode, setJustCreatedCode] = useState<string | null>(null);
  // AI analysis starts automatically (no separate prompt needed)

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
        // Kein Toast - UI-Update reicht
        refetch();
      },
      onError: () => toast.error("Freigabe konnte nicht aktiviert werden"),
    });
  };

  // Freigabe beenden
  const handleRevoke = () => {
    revokeMutation.mutate(undefined, {
      onSuccess: () => {
        // Kein Toast - UI-Update reicht
        refetch();
      },
      onError: () => toast.error("Freigabe konnte nicht beendet werden"),
    });
  };

  // Dialog-Complete Handler
  const handleShareComplete = (shareCode: string) => {
    setShowSetupDialog(false);
    setJustCreatedCode(shareCode);
    refetch();
  };

  const isShareActive = shareStatus?.is_share_active ?? false;
  const isPending = activateMutation.isPending || revokeMutation.isPending;

  // Zeige Setup-Dialog wenn noch keine Freigabe aktiv und nicht heute revoked
  const shouldShowSetup = !isLoading && !error && shareStatus && 
    !isShareActive && !shareStatus.was_revoked_today && !justCreatedCode;

  // Automatisch Dialog öffnen für neue Shares
  useEffect(() => {
    if (shouldShowSetup && !showSetupDialog) {
      setShowSetupDialog(true);
    }
  }, [shouldShowSetup, showSetupDialog]);

  // Wenn Setup-Dialog aktiv, zeige ihn im vollen Screen
  if (showSetupDialog) {
    return (
      <div className="flex flex-col h-full bg-background">
        <AppHeader 
          title="Mit Arzt teilen" 
          onBack={() => {
            setShowSetupDialog(false);
            onBack();
          }} 
          sticky 
        />
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-4xl mx-auto">
            <DoctorShareDialog
              onComplete={handleShareComplete}
              onCancel={() => {
                setShowSetupDialog(false);
                onBack();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <AppHeader title="Mit Arzt teilen" onBack={onBack} sticky />

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-md mx-auto pt-4">

          {/* Lade-Zustand */}
          {isLoading && (
            <div className="py-16 text-center">
              <div className="animate-pulse space-y-4">
                <div className="h-12 bg-muted/30 rounded-lg max-w-[180px] mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Wird geladen…
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
          {!isLoading && !error && (shareStatus?.is_share_active || justCreatedCode) && (
            <div className="flex flex-col items-center space-y-8">
              {/* Success Message nach Erstellung */}
              {justCreatedCode && (
                <div className="w-full bg-primary/5 border border-primary/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-foreground font-medium">
                    ✓ Freigabe erstellt & Bericht gespeichert
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Das PDF findest du unter „Gespeicherte Berichte"
                  </p>
                </div>
              )}

              {/* Der Code - tappbar zum Kopieren */}
              <button
                onClick={handleCopyCode}
                className="bg-primary/5 border border-primary/20 rounded-xl px-8 py-6 cursor-pointer hover:bg-primary/10 active:scale-[0.98] transition-all duration-150 flex items-center gap-4"
                aria-label="Code kopieren"
              >
                <div className="font-mono text-4xl font-bold tracking-widest text-foreground">
                  {justCreatedCode || shareStatus?.code_display}
                </div>
                {copied ? (
                  <Check className="w-5 h-5 text-primary shrink-0" />
                ) : (
                  <Copy className="w-5 h-5 text-muted-foreground/60 shrink-0" />
                )}
              </button>

              {/* Zeitinformation */}
              {shareStatus?.share_active_until && (
                <p className="text-sm text-muted-foreground">
                  Zugriff möglich bis {formatActiveUntil(shareStatus.share_active_until)}
                </p>
              )}

              {/* Hilfreiche Links */}
              <div className="w-full space-y-2">
                <a 
                  href="https://migraina.lovable.app/doctor"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg border border-muted hover:bg-muted/50 transition-colors text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Website für Ihren Arzt öffnen
                </a>
              </div>

              {/* Freigabe beenden - dezent */}
              <div className="pt-4">
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

          {/* Zustand C: Freigabe INAKTIV (heute beendet) */}
          {!isLoading && !error && shareStatus && !isShareActive && 
           shareStatus.was_revoked_today && !justCreatedCode && (
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

              {/* Oder neu einrichten */}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowSetupDialog(true)}
              >
                Neue Freigabe einrichten
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorShareScreen;
