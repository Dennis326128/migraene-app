import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, FlaskConical, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ensureUserProfile } from "@/utils/ensureUserProfile";
import { signupSchema, loginSchema } from "@/lib/zod/authSchemas";
import { isDemoEnabled, startDemoUser, type DemoProgress } from "@/lib/demo";
import { Progress } from "@/components/ui/progress";

export default function AuthPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  
  // Demo mode state
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoProgress, setDemoProgress] = useState<DemoProgress | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        await ensureUserProfile();
        navigate("/");
      }
    });
  }, [navigate]);

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
        const redirectUrl = `${window.location.origin}/`;
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
        // Bei Registrierung Toast anzeigen (E-Mail-Bestätigung nötig)
        if (!isLogin) {
          toast({
            title: "Registrierung erfolgreich",
            description: "Bitte bestätigen Sie Ihre E-Mail.",
          });
        }
        
        if (isLogin) {
          await ensureUserProfile();
          navigate("/");
        } else {
          // Consent-Daten beim Signup speichern
          await ensureUserProfile({
            termsAccepted: acceptedTerms,
            privacyAccepted: acceptedPrivacy
          });
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
      const redirectUrl = `${window.location.origin}/reset-password`;
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

  const handleDemoStart = async () => {
    if (!isDemoEnabled()) return;
    
    setDemoLoading(true);
    setDemoProgress({ message: 'Starte Demo...', percent: 0 });

    const result = await startDemoUser((progress) => {
      setDemoProgress(progress);
    });

    if (result.success) {
      toast({
        title: "Demo bereit",
        description: demoProgress?.message || "Demo-Daten wurden erstellt",
      });
      navigate("/");
    } else {
      toast({
        title: "Demo-Fehler",
        description: result.error,
        variant: "destructive",
      });
    }

    setDemoLoading(false);
    setDemoProgress(null);
  };

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
            disabled={loading || (!isLogin && !isForgotPassword && (!acceptedTerms || !acceptedPrivacy))}
          >
            {loading ? "Wird verarbeitet..." : (isForgotPassword ? "Link senden" : (isLogin ? "Einloggen" : "Registrieren"))}
          </Button>
          
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

        {/* DEV-only Demo Button */}
        {isDemoEnabled() && (
          <Card className="w-full border-dashed border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
                <FlaskConical className="h-4 w-4" />
                <span className="font-medium">Entwicklermodus</span>
              </div>
              
              {demoProgress && (
                <div className="space-y-2">
                  <Progress value={demoProgress.percent} className="h-2" />
                  <p className="text-xs text-muted-foreground">{demoProgress.message}</p>
                </div>
              )}
              
              <Button
                variant="outline"
                onClick={handleDemoStart}
                disabled={demoLoading || loading}
                className="w-full border-yellow-500/50 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
              >
                {demoLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Demo wird erstellt...
                  </>
                ) : (
                  <>
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Demo: Max Mustermann starten
                  </>
                )}
              </Button>
              
              <p className="text-xs text-muted-foreground text-center">
                Erstellt einen Test-Account mit 90 Tagen Beispieldaten
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
