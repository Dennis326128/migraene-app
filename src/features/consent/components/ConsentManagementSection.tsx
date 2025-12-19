import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Shield, Check, X, AlertTriangle, FileDown } from "lucide-react";
import { useConsent, useWithdrawConsent } from "../hooks/useConsent";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export const ConsentManagementSection: React.FC = () => {
  const { data: consent, isLoading } = useConsent();
  const withdrawConsent = useWithdrawConsent();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [withdrawalReason, setWithdrawalReason] = useState("");

  const hasValidHealthConsent = consent?.health_data_consent === true && 
                                 consent?.consent_withdrawn_at === null;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleWithdraw = async () => {
    try {
      await withdrawConsent.mutateAsync(withdrawalReason || undefined);
      toast({
        title: "Einwilligung widerrufen",
        description: "Ihre Einwilligung wurde widerrufen. Die App-Funktionen sind eingeschränkt.",
        variant: "destructive",
      });
      setShowWithdrawDialog(false);
      // Redirect to account status page or show restricted mode
      navigate("/account-status");
    } catch (error) {
      console.error("Error withdrawing consent:", error);
      toast({
        title: "Fehler",
        description: "Der Widerruf konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card className={cn("p-6", isMobile && "p-4")}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn("p-6", isMobile && "p-4")}>
        <CardHeader className="px-0 pt-0">
          <CardTitle className={cn("text-lg font-medium flex items-center gap-2", isMobile && "text-base")}>
            <Shield className="h-5 w-5" />
            Einwilligungen verwalten
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 space-y-4">
          {/* Health Data Consent Status */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">Gesundheitsdaten-Verarbeitung</span>
                <Badge variant={hasValidHealthConsent ? "default" : "destructive"}>
                  {hasValidHealthConsent ? (
                    <><Check className="h-3 w-3 mr-1" /> Aktiv</>
                  ) : (
                    <><X className="h-3 w-3 mr-1" /> Widerrufen</>
                  )}
                </Badge>
              </div>
            </div>

            <p className={cn("text-sm text-muted-foreground", isMobile && "text-xs")}>
              Einwilligung zur Verarbeitung von Gesundheitsdaten nach Art. 9 DSGVO 
              (Schmerzeinträge, Symptome, Medikation).
            </p>

            {consent && (
              <div className="text-xs text-muted-foreground space-y-1">
                {consent.health_data_consent_at && (
                  <p>Erteilt am: {formatDate(consent.health_data_consent_at)}</p>
                )}
                {consent.consent_withdrawn_at && (
                  <p className="text-destructive">
                    Widerrufen am: {formatDate(consent.consent_withdrawn_at)}
                  </p>
                )}
                <p>Version: {consent.health_data_consent_version || "1.0"}</p>
              </div>
            )}

            {hasValidHealthConsent && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowWithdrawDialog(true)}
              >
                <X className="h-4 w-4 mr-2" />
                Einwilligung widerrufen
              </Button>
            )}
          </div>

          {/* Terms & Privacy Consent Status */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">AGB & Datenschutzerklärung</span>
              <Badge variant="default">
                <Check className="h-3 w-3 mr-1" /> Akzeptiert
              </Badge>
            </div>

            <p className={cn("text-sm text-muted-foreground", isMobile && "text-xs")}>
              Zustimmung zu den Allgemeinen Geschäftsbedingungen und der Datenschutzerklärung.
            </p>

            {consent && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>AGB Version: {consent.terms_version}</p>
                <p>Datenschutz Version: {consent.privacy_version}</p>
                <p>Akzeptiert am: {formatDate(consent.terms_accepted_at)}</p>
              </div>
            )}
          </div>

          {/* Medical Disclaimer */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Medizinischer Hinweis</span>
              <Badge variant={consent?.medical_disclaimer_accepted_at ? "default" : "secondary"}>
                {consent?.medical_disclaimer_accepted_at ? (
                  <><Check className="h-3 w-3 mr-1" /> Akzeptiert</>
                ) : (
                  "Ausstehend"
                )}
              </Badge>
            </div>

            <p className={cn("text-sm text-muted-foreground", isMobile && "text-xs")}>
              Diese App ersetzt keine ärztliche Beratung, Diagnose oder Behandlung.
            </p>

            {consent?.medical_disclaimer_accepted_at && (
              <p className="text-xs text-muted-foreground">
                Akzeptiert am: {formatDate(consent.medical_disclaimer_accepted_at)}
              </p>
            )}
          </div>

          {/* Export Hint */}
          <div className="bg-muted/50 rounded-lg p-4 flex items-start gap-3">
            <FileDown className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className={cn("text-sm font-medium", isMobile && "text-xs")}>
                Tipp: Daten vor Widerruf exportieren
              </p>
              <p className={cn("text-sm text-muted-foreground", isMobile && "text-xs")}>
                Bevor Sie Ihre Einwilligung widerrufen, können Sie Ihre Daten über 
                die "Account löschen" Funktion als Bericht exportieren.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal Confirmation Dialog */}
      <AlertDialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Einwilligung widerrufen?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Wenn Sie Ihre Einwilligung zur Verarbeitung von Gesundheitsdaten widerrufen:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Werden alle App-Funktionen deaktiviert</li>
                <li>Können keine neuen Einträge erstellt werden</li>
                <li>Bleiben Ihre Daten erhalten (Sie können sie exportieren)</li>
                <li>Können Sie die Einwilligung später erneut erteilen</li>
              </ul>
              <p className="text-sm font-medium">
                Möchten Sie stattdessen Ihren Account und alle Daten vollständig löschen?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2">
            <label className="text-sm font-medium">Grund für den Widerruf (optional):</label>
            <Textarea
              value={withdrawalReason}
              onChange={(e) => setWithdrawalReason(e.target.value)}
              placeholder="z.B. Nutze die App nicht mehr..."
              className="mt-2"
              rows={2}
            />
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setShowWithdrawDialog(false);
                navigate("/settings/privacy");
              }}
            >
              Account löschen
            </Button>
            <AlertDialogAction
              onClick={handleWithdraw}
              className="bg-destructive hover:bg-destructive/90"
              disabled={withdrawConsent.isPending}
            >
              {withdrawConsent.isPending ? "Widerrufe..." : "Einwilligung widerrufen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
