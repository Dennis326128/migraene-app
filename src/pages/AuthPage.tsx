import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ensureUserProfile } from "@/utils/ensureUserProfile";
import { LegalLinks } from "@/components/ui/legal-links";
import { signupSchema, loginSchema } from "@/lib/zod/authSchemas";
import { ResendConfirmationButton } from "@/components/auth/ResendConfirmationButton";

// Google Icon SVG
const GoogleIcon = () => (
  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="currentColor"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="currentColor"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="currentColor"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export default function AuthPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showConfirmationPending, setShowConfirmationPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        await ensureUserProfile();
        navigate("/");
      }
    });
  }, [navigate]);

  // Google OAuth Sign In
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) {
        console.error('[GoogleAuth] Error:', error);
        toast({
          title: "Google Anmeldung fehlgeschlagen",
          description: error.message,
          variant: "destructive"
        });
        setGoogleLoading(false);
      }
      // Note: On success, user is redirected to Google, so no need to reset loading
    } catch (error) {
      console.error('[GoogleAuth] Unexpected error:', error);
      toast({
        title: "Fehler",
        description: "Google Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
        variant: "destructive"
      });
      setGoogleLoading(false);
    }
  };

  const handleAuth = async () => {
    if (!email || !password) {
      toast({ title: "Fehler", description: "Bitte E-Mail und Passwort eingeben.", variant: "destructive" });
      return;
    }

    // Zod-Validierung
    try {
      if (isLogin) {
        loginSchema.parse({ email, password });
      } else {
        signupSchema.parse({ 
          email, 
          password, 
          acceptedTerms, 
          acceptedPrivacy 
        });
      }
    } catch (validationError: any) {
      const errorMsg = validationError.errors?.[0]?.message || "Ungültige Eingabe";
      toast({ 
        title: "Validierungsfehler", 
        description: errorMsg,
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    let result;

    try {
      if (isLogin) {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        // Prefetch-sichere URL: führt zu /auth/confirm, dann weiter zu /
        const redirectUrl = `${window.location.origin}/auth/confirm?type=email&next=/`;
        result = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl }
        });
      }

      setLoading(false);

      if (result.error) {
        // Sanitize error message - don't leak info about whether email exists
        let errorMsg = "Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.";
        
        if (result.error.message.includes("Invalid login credentials")) {
          errorMsg = "E-Mail oder Passwort ist falsch.";
        } else if (result.error.message.includes("Email not confirmed")) {
          errorMsg = "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.";
        } else if (result.error.message.includes("User already registered")) {
          errorMsg = "Ein Konto mit dieser E-Mail-Adresse existiert bereits.";
        }
        
        toast({ title: "Fehler", description: errorMsg, variant: "destructive" });
      } else {
        if (isLogin) {
          await ensureUserProfile();
          navigate("/");
        } else {
          // Consent-Daten beim Signup speichern
          await ensureUserProfile({
            termsAccepted: acceptedTerms,
            privacyAccepted: acceptedPrivacy
          });
          
          // Zeige Bestätigungs-Pending Screen
          setPendingEmail(email);
          setShowConfirmationPending(true);
        }
      }
    } catch (error) {
      setLoading(false);
      toast({ 
        title: "Fehler", 
        description: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.",
        variant: "destructive" 
      });
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Fehler", description: "Bitte E-Mail-Adresse eingeben.", variant: "destructive" });
      return;
    }

    // Validate email format
    try {
      loginSchema.pick({ email: true }).parse({ email });
    } catch (validationError: any) {
      const errorMsg = validationError.errors?.[0]?.message || "Ungültige E-Mail-Adresse";
      toast({ 
        title: "Validierungsfehler", 
        description: errorMsg,
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    try {
      // Prefetch-sichere URL: führt zu /auth/confirm, dann weiter zu /auth/update-password
      const redirectUrl = `${window.location.origin}/auth/confirm?type=recovery&next=/auth/update-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      setLoading(false);

      if (error) {
        // Don't reveal whether email exists or not - security best practice
        toast({ 
          title: "Fehler", 
          description: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.",
          variant: "destructive" 
        });
      } else {
        toast({
          title: "E-Mail versendet",
          description: "Falls ein Konto mit dieser E-Mail existiert, haben wir Ihnen einen Link zur Passwortwiederherstellung gesendet.",
        });
        setIsForgotPassword(false);
        setIsLogin(true);
      }
    } catch (error) {
      setLoading(false);
      toast({ 
        title: "Fehler", 
        description: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.",
        variant: "destructive" 
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (isForgotPassword) {
        handleForgotPassword();
      } else {
        handleAuth();
      }
    }
  };

  // Confirmation Pending Screen nach Registrierung
  if (showConfirmationPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          {/* App-Branding Header */}
          <div className="text-center space-y-2 mb-4">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent pb-2 leading-tight relative z-10">
              Migräne-App
            </h1>
          </div>

          <Card className="w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-xl">Bestätige deine E-Mail</CardTitle>
              <CardDescription className="text-base">
                Wir haben dir eine E-Mail an{" "}
                <span className="font-medium text-foreground">{pendingEmail}</span>{" "}
                gesendet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-primary/30 bg-primary/5">
                <CheckCircle className="h-4 w-4 text-primary" />
                <AlertDescription>
                  Bitte klicke auf den Bestätigungslink in der E-Mail, um dein Konto zu aktivieren.
                </AlertDescription>
              </Alert>

              <div className="pt-2 space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Keine E-Mail erhalten? Prüfe deinen Spam-Ordner oder:
                </p>
                
                <ResendConfirmationButton
                  email={pendingEmail}
                  variant="outline"
                  className="w-full"
                />
              </div>

              <div className="pt-4 border-t">
                <button
                  onClick={() => {
                    setShowConfirmationPending(false);
                    setPendingEmail("");
                    setEmail("");
                    setPassword("");
                    setIsLogin(true);
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                >
                  ← Zurück zur Anmeldung
                </button>
              </div>
            </CardContent>
          </Card>

          <LegalLinks variant="inline" className="pt-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* App-Branding Header */}
        <div className="text-center space-y-2 mb-4">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent pb-2 leading-tight relative z-10">
            Migräne-App
          </h1>
          <p className="text-muted-foreground text-sm md:text-base font-medium">
            Alles Wichtige zu deiner Migräne in einer App
          </p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">
              {isForgotPassword ? "Passwort zurücksetzen" : (isLogin ? "Einloggen" : "Registrieren")}
            </CardTitle>
          </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email" className="mb-1 block">E-Mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyPress={handleKeyPress} disabled={loading}/>
          </div>
          {!isForgotPassword && (
            <div>
              <Label htmlFor="password" className="mb-1 block">Passwort</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={handleKeyPress} disabled={loading}/>
            </div>
          )}
          
          {!isLogin && !isForgotPassword && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="terms" 
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                  disabled={loading}
                  className="mt-1"
                />
                <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                  Ich akzeptiere die{' '}
                  <a 
                    href="/terms" 
                    target="_blank"
                    className="text-primary underline hover:text-primary/80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Allgemeinen Geschäftsbedingungen (AGB)
                  </a>
                </Label>
              </div>
              
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="privacy" 
                  checked={acceptedPrivacy}
                  onCheckedChange={(checked) => setAcceptedPrivacy(checked === true)}
                  disabled={loading}
                  className="mt-1"
                />
                <Label htmlFor="privacy" className="text-sm leading-relaxed cursor-pointer">
                  Ich habe die{' '}
                  <a 
                    href="/privacy" 
                    target="_blank"
                    className="text-primary underline hover:text-primary/80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Datenschutzerklärung
                  </a>
                  {' '}gelesen und akzeptiert
                </Label>
              </div>
              
              <Alert className="mt-3 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-xs text-yellow-800 dark:text-yellow-200">
                  Diese App dient nur der persönlichen Dokumentation und ersetzt keine ärztliche Beratung.
                </AlertDescription>
              </Alert>
            </div>
          )}
          
          {isLogin && !isForgotPassword && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="remember" 
                  checked={rememberMe} 
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                  Eingeloggt bleiben
                </Label>
              </div>
              <button 
                onClick={() => setIsForgotPassword(true)} 
                className="text-primary hover:underline text-sm"
                disabled={loading}
              >
                Passwort vergessen?
              </button>
            </div>
          )}
          
          <Button 
            onClick={isForgotPassword ? handleForgotPassword : handleAuth} 
            className="w-full" 
            disabled={loading || googleLoading || (!isLogin && !isForgotPassword && (!acceptedTerms || !acceptedPrivacy))}
          >
            {loading ? "Wird verarbeitet..." : (isForgotPassword ? "Link senden" : (isLogin ? "Einloggen" : "Registrieren"))}
          </Button>

          {/* Google OAuth - nur bei Login/Register, nicht bei Passwort vergessen */}
          {!isForgotPassword && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">oder</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={loading || googleLoading}
              >
                {googleLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Wird verbunden...
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    Mit Google fortfahren
                  </>
                )}
              </Button>
            </>
          )}
          
          <div className="text-center space-y-2">
            {!isForgotPassword && (
              <button 
                onClick={() => setIsLogin(!isLogin)} 
                className="text-primary hover:underline text-sm block w-full" 
                disabled={loading}
              >
                {isLogin ? "Noch kein Konto? Jetzt registrieren" : "Bereits registriert? Hier einloggen"}
              </button>
            )}
            {isForgotPassword && (
              <button 
                onClick={() => {
                  setIsForgotPassword(false);
                  setIsLogin(true);
                }} 
                className="text-muted-foreground hover:text-foreground text-sm block w-full" 
                disabled={loading}
              >
                ← Zurück zum Login
              </button>
            )}
          </div>
        </CardContent>
        </Card>
        
        {/* Legal Links Footer */}
        <LegalLinks variant="inline" className="pt-2" />
      </div>
    </div>
  );
}
