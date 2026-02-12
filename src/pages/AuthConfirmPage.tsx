import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Loader2, Mail, KeyRound, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type VerificationType = "email" | "recovery" | "signup" | "magiclink";

export default function AuthConfirmPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as VerificationType | null;
  const next = searchParams.get("next") || "/";
  
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Validate params on mount
  const isValid = tokenHash && type;

  const handleConfirm = async () => {
    if (!tokenHash || !type) return;
    
    setStatus("loading");
    setErrorMessage("");

    try {
      // Map type to Supabase OTP type
      let otpType: "email" | "recovery" | "signup" | "magiclink" = type;
      if (type === "email") {
        otpType = "signup"; // Supabase uses "signup" for email confirmation
      }

      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });

      if (error) {
        console.error("[AuthConfirm] Verification error:", error);
        setStatus("error");
        
        if (error.message.includes("expired") || error.message.includes("invalid")) {
          setErrorMessage("Der Link ist abgelaufen oder ungültig. Bitte fordern Sie einen neuen an.");
        } else if (error.message.includes("already")) {
          setErrorMessage("Diese E-Mail wurde bereits bestätigt.");
          // Still redirect after a moment
          setTimeout(() => navigate(next), 2000);
        } else {
          setErrorMessage(error.message || "Ein Fehler ist aufgetreten.");
        }
        return;
      }

      setStatus("success");
      
      toast({
        title: type === "recovery" ? "Verifizierung erfolgreich" : "E-Mail bestätigt",
        description: type === "recovery" 
          ? "Sie können jetzt ein neues Passwort setzen." 
          : "Ihr Konto wurde aktiviert.",
      });

      // Redirect based on type
      setTimeout(() => {
        if (type === "recovery") {
          navigate("/auth/update-password");
        } else {
          navigate(next);
        }
      }, 1500);

    } catch (err) {
      console.error("[AuthConfirm] Unexpected error:", err);
      setStatus("error");
      setErrorMessage("Ein unerwarteter Fehler ist aufgetreten.");
    }
  };

  // Auto-check if user is already logged in (for recovery flow)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && type !== "recovery") {
        // Already logged in, redirect
        navigate(next);
      }
    };
    checkSession();
  }, [navigate, next, type]);

  // Invalid params
  if (!isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Ungültiger Link</CardTitle>
            <CardDescription>
              Dieser Bestätigungslink ist unvollständig oder fehlerhaft.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Der Link enthält nicht alle notwendigen Parameter. 
                Bitte verwenden Sie den vollständigen Link aus Ihrer E-Mail.
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => navigate("/auth")} 
              className="w-full"
            >
              Zur Anmeldung
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            {type === "recovery" ? (
              <KeyRound className="h-6 w-6 text-primary" />
            ) : (
              <Mail className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle>
            {type === "recovery" ? "Passwort zurücksetzen" : "E-Mail bestätigen"}
          </CardTitle>
          <CardDescription>
            {type === "recovery" 
              ? "Klicken Sie auf den Button, um fortzufahren und ein neues Passwort zu setzen."
              : "Klicken Sie auf den Button, um Ihre E-Mail-Adresse zu bestätigen und Ihr Konto zu aktivieren."
            }
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {status === "error" && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {status === "success" && (
            <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                {type === "recovery" 
                  ? "Verifizierung erfolgreich! Sie werden weitergeleitet..."
                  : "E-Mail bestätigt! Sie werden weitergeleitet..."
                }
              </AlertDescription>
            </Alert>
          )}

          {status !== "success" && (
            <Button 
              onClick={handleConfirm} 
              className="w-full"
              disabled={status === "loading"}
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird verifiziert...
                </>
              ) : (
                <>
                  {type === "recovery" ? "Fortfahren" : "Jetzt bestätigen"}
                </>
              )}
            </Button>
          )}

          {status === "error" && (
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                {type === "recovery" 
                  ? "Fordern Sie einen neuen Link an:"
                  : "Registrieren Sie sich erneut:"
                }
              </p>
              <Button 
                variant="outline" 
                onClick={() => navigate("/auth")}
                className="w-full"
              >
                Zur Anmeldung
              </Button>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground pt-4 border-t">
            <p>
              Dieser Link wurde von Miary gesendet.
              <br />
              Wenn Sie keine E-Mail angefordert haben, ignorieren Sie diese Seite.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
