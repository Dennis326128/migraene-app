import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, LogIn, ArrowRight, AlertTriangle, Loader2, AlertCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useSaveHealthDataConsent } from "@/features/consent/hooks/useConsent";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ConsentRequiredPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const saveConsent = useSaveHealthDataConsent();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = () => {
    navigate("/auth");
  };

  const handleGrantConsent = async () => {
    setError(null);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Not signed in: send to auth so they can log in first
        navigate("/auth");
        return;
      }
      await saveConsent.mutateAsync(true);
      toast({
        title: "Einwilligung gespeichert",
        description: "Du kannst die App jetzt nutzen.",
      });
      navigate("/");
    } catch (e: any) {
      console.error("[ConsentRequiredPage] save error", e);
      const msg = e?.message ?? "Speichern fehlgeschlagen. Bitte erneut versuchen.";
      setError(msg);
      toast({ title: "Fehler", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-950">
              <Shield className="h-8 w-8 text-amber-600" />
            </div>
          </div>
          <CardTitle className="text-xl">Einwilligung erforderlich</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Diese App verarbeitet Gesundheitsdaten</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Um die App nutzen zu können, ist deine ausdrückliche Einwilligung
                  zur Verarbeitung deiner Gesundheitsdaten nach Art. 9 DSGVO erforderlich.
                </p>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong>Ohne Einwilligung kannst du:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Keine Schmerzeinträge erstellen</li>
              <li>Keine Medikamente dokumentieren</li>
              <li>Keine Analysen und Berichte erstellen</li>
            </ul>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              Deine Entscheidung wird respektiert. Du kannst die Einwilligung jederzeit
              in den Einstellungen widerrufen.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <Button onClick={handleGrantConsent} disabled={saving} className="w-full">
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird gespeichert …</>
              ) : (
                <><ArrowRight className="h-4 w-4 mr-2" /> Einwilligung erteilen</>
              )}
            </Button>

            <Button variant="outline" onClick={handleLogin} disabled={saving} className="w-full">
              <LogIn className="h-4 w-4 mr-2" />
              Zur Anmeldung
            </Button>
          </div>

          <div className="text-center text-xs text-muted-foreground pt-4 border-t">
            <p>
              Weitere Informationen:{" "}
              <Link to="/privacy" className="text-primary underline hover:no-underline">
                Datenschutzerklärung
              </Link>
              {" • "}
              <Link to="/medical-disclaimer" className="text-primary underline hover:no-underline">
                Medizinischer Hinweis
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
