import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/hooks/use-toast";
import { deactivateAccount } from "@/features/account/api/accountStatus.api";
import { AlertTriangle, LogIn, PauseCircle, ShieldAlert, Trash2, Loader2 } from "lucide-react";

export default function KontoLoeschenPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [showFirstConfirm, setShowFirstConfirm] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Deactivation
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const goToLogin = () => {
    const redirect = encodeURIComponent("/konto-loeschen");
    navigate(`/auth?redirect=${redirect}`);
  };

  const handleDeactivate = async () => {
    setIsDeactivating(true);
    try {
      await deactivateAccount();
      toast({ title: "Konto deaktiviert", description: "Deine Daten bleiben erhalten." });
      navigate("/account-status");
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message ?? "Deaktivierung fehlgeschlagen", variant: "destructive" });
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleFinalDelete = async () => {
    if (confirmWord !== "LÖSCHEN") return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-my-account", {
        body: { confirmation: "LÖSCHEN", password: password || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      // Clear local state
      try { await supabase.auth.signOut(); } catch { /* already gone */ }
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }

      navigate("/konto-geloescht", { replace: true });
    } catch (e: any) {
      const msg = e?.message === "invalid_password"
        ? "Passwort ist nicht korrekt."
        : e?.message === "confirmation_required"
        ? "Bitte gib „LÖSCHEN" ein."
        : "Löschung fehlgeschlagen. Bitte später erneut versuchen oder Support kontaktieren.";
      toast({ title: "Fehler", description: msg, variant: "destructive" });
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Konto und Daten löschen</h1>
          <p className="text-sm text-muted-foreground">
            Hier kannst du dein Miary-Konto und die zugehörigen Daten dauerhaft löschen.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Was wird gelöscht?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Gelöscht werden dauerhaft:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dein Konto und deine Profildaten</li>
              <li>Tagebucheinträge, Symptome, Medikamente und Trigger</li>
              <li>Notizen, KI-Auswertungen und Analysen</li>
              <li>Einstellungen und sonstige nutzerbezogene Daten</li>
            </ul>
            <p className="pt-2">
              Diese Löschung ist <strong>dauerhaft</strong> und kann nicht rückgängig gemacht werden.
            </p>
          </CardContent>
        </Card>

        {!session ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bitte einloggen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Um dein Konto zu löschen, musst du eingeloggt sein.
              </p>
              <Button onClick={goToLogin} className="w-full">
                <LogIn className="h-4 w-4 mr-2" />
                Einloggen, um Konto zu löschen
              </Button>
              <div className="text-xs text-muted-foreground border-t pt-3">
                Falls du keinen Zugriff mehr auf dein Konto hast, schreibe an{" "}
                <a href="mailto:miary.support@gmail.com?subject=Miary%20Konto%20l%C3%B6schen"
                   className="underline">miary.support@gmail.com</a>{" "}
                mit dem Betreff „Miary Konto löschen" und der E-Mail-Adresse deines Miary-Kontos.
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dein Konto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  Angemeldet als <strong>{session.user.email}</strong>
                </p>
                <div className="rounded-md bg-destructive/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm">
                    Diese Aktion löscht dein Konto und deine zugehörigen Miary-Daten dauerhaft.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PauseCircle className="h-4 w-4" />
                  Konto stattdessen unbefristet deaktivieren
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Deine Daten bleiben erhalten, aber dein Konto wird deaktiviert. Du kannst dich später
                  an den Support wenden, wenn du es reaktivieren möchtest.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowDeactivateConfirm(true)}
                >
                  Konto unbefristet deaktivieren
                </Button>
              </CardContent>
            </Card>

            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  Konto und Daten löschen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowFirstConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Konto und Daten löschen
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        <div className="text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">Zurück zur App</Link>
        </div>
      </div>

      {/* Deactivate confirmation */}
      <AlertDialog open={showDeactivateConfirm} onOpenChange={setShowDeactivateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konto deaktivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Deine Daten bleiben gespeichert. Du wirst ausgeloggt und kannst dich später über den
              Support reaktivieren lassen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeactivating}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} disabled={isDeactivating}>
              {isDeactivating ? "Wird deaktiviert..." : "Ja, deaktivieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* First confirmation */}
      <AlertDialog open={showFirstConfirm} onOpenChange={setShowFirstConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konto wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dein Konto und deine Miary-Daten werden dauerhaft gelöscht. Diese Aktion kann nicht
              rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowFirstConfirm(false);
                setShowFinalConfirm(true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Weiter zur endgültigen Bestätigung
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Final confirmation */}
      <AlertDialog
        open={showFinalConfirm}
        onOpenChange={(open) => {
          if (isDeleting) return;
          setShowFinalConfirm(open);
          if (!open) { setConfirmWord(""); setPassword(""); }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Endgültige Bestätigung</AlertDialogTitle>
            <AlertDialogDescription>
              Bitte gib das Wort <strong>LÖSCHEN</strong> ein und – zur Sicherheit – dein aktuelles
              Passwort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="confirm-word">Bestätigungswort</Label>
              <Input
                id="confirm-word"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder="LÖSCHEN"
                autoComplete="off"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="confirm-pw">Passwort</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Aktuelles Passwort"
                autoComplete="current-password"
                className="mt-1"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFinalDelete}
              disabled={isDeleting || confirmWord !== "LÖSCHEN"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird gelöscht...</>
              ) : (
                "Endgültig löschen"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
