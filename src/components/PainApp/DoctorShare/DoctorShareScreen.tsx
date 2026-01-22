/**
 * DoctorShareScreen
 * Vollbild-Ansicht nach Erstellung eines Freigabe-Codes
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  XCircle,
  Clock,
  Eye,
  UserRound,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import {
  useActiveDoctorShares,
  useCreateDoctorShare,
  useRevokeDoctorShare,
  type DoctorShare,
} from "@/features/doctor-share";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DoctorShareScreenProps {
  onBack: () => void;
}

export const DoctorShareScreen: React.FC<DoctorShareScreenProps> = ({ onBack }) => {
  const { data: activeShares, isLoading } = useActiveDoctorShares();
  const createShare = useCreateDoctorShare();
  const revokeShare = useRevokeDoctorShare();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeConfirmShare, setRevokeConfirmShare] = useState<DoctorShare | null>(null);

  // URL für Arzt - nutze origin, in Prod korrekt
  const getDoctorUrl = () => {
    return `${window.location.origin}/doctor`;
  };

  // Code kopieren
  const handleCopyCode = async (share: DoctorShare) => {
    try {
      await navigator.clipboard.writeText(share.code_display);
      setCopiedId(share.id);
      toast.success("Code kopiert");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  // Link öffnen
  const handleOpenLink = () => {
    window.open(getDoctorUrl(), "_blank");
  };

  // Neue Freigabe erstellen
  const handleCreateShare = () => {
    createShare.mutate();
  };

  // Freigabe widerrufen
  const handleRevoke = () => {
    if (revokeConfirmShare) {
      revokeShare.mutate(revokeConfirmShare.id);
      setRevokeConfirmShare(null);
    }
  };

  // Formatierung
  const formatExpiry = (expiresAt: string) => {
    return format(new Date(expiresAt), "d. MMMM yyyy, HH:mm 'Uhr'", { locale: de });
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

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Info-Text */}
        <p className="text-sm text-muted-foreground">
          Erstellen Sie einen Freigabe-Code, den Ihr Arzt unter{" "}
          <span className="font-mono text-foreground">{getDoctorUrl()}</span>{" "}
          eingeben kann. Die Freigabe ist 24 Stunden gültig.
        </p>

        {/* Aktive Freigaben */}
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Lade...</div>
        ) : activeShares && activeShares.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Aktive Freigaben
            </h2>
            {activeShares.map((share) => (
              <Card key={share.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Code */}
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-2xl font-bold tracking-wider text-primary">
                      {share.code_display}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyCode(share)}
                      className="gap-2"
                    >
                      {copiedId === share.id ? (
                        <>
                          <Check className="w-4 h-4" />
                          Kopiert
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Kopieren
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Gültigkeit */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Gültig bis: {formatExpiry(share.expires_at)}</span>
                  </div>

                  {/* Letzter Zugriff */}
                  {share.last_accessed_at && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Eye className="w-4 h-4" />
                      <span>
                        Zuletzt aufgerufen:{" "}
                        {format(new Date(share.last_accessed_at), "d. MMM, HH:mm", {
                          locale: de,
                        })}
                      </span>
                    </div>
                  )}

                  {/* Aktionen */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenLink}
                      className="gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Link öffnen
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeConfirmShare(share)}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <XCircle className="w-4 h-4" />
                      Beenden
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <UserRound className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">Keine aktiven Freigaben</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Erstellen Sie eine Freigabe, um Ihre Daten mit Ihrem Arzt zu teilen.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Neue Freigabe erstellen */}
        <Button
          onClick={handleCreateShare}
          disabled={createShare.isPending}
          className="w-full"
          size="lg"
        >
          {createShare.isPending ? "Wird erstellt..." : "Neue Freigabe erstellen"}
        </Button>
      </div>

      {/* Widerruf-Dialog */}
      <AlertDialog
        open={!!revokeConfirmShare}
        onOpenChange={(open) => !open && setRevokeConfirmShare(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Freigabe beenden?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Code wird sofort ungültig und Ihr Arzt kann nicht mehr auf Ihre
              Daten zugreifen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Beenden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DoctorShareScreen;
