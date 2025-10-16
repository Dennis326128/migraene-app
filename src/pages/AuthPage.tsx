import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ensureUserProfile } from "@/utils/ensureUserProfile";
import { signupSchema, loginSchema } from "@/lib/zod/authSchemas";

export default function AuthPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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
      toast({ 
        title: "Validierungsfehler", 
        description: validationError.errors[0]?.message || "Ungültige Eingabe",
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    let result;

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
      toast({ title: "Fehler", description: result.error.message, variant: "destructive" });
    } else {
      toast({
        title: isLogin ? "Erfolgreich eingeloggt" : "Registrierung erfolgreich",
        description: isLogin ? "Sie werden weitergeleitet..." : "Bitte bestätigen Sie Ihre E-Mail.",
      });
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
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAuth();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            {isLogin ? "Einloggen" : "Registrieren"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email" className="mb-1 block">E-Mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyPress={handleKeyPress} disabled={loading}/>
          </div>
          <div>
            <Label htmlFor="password" className="mb-1 block">Passwort</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={handleKeyPress} disabled={loading}/>
          </div>
          
          {!isLogin && (
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
          
          {isLogin && (
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="remember" 
                checked={rememberMe} 
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                disabled={loading}
              />
              <Label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                Eingeloggt bleiben (empfohlen)
              </Label>
            </div>
          )}
          <Button 
            onClick={handleAuth} 
            className="w-full" 
            disabled={loading || (!isLogin && (!acceptedTerms || !acceptedPrivacy))}
          >
            {loading ? "Wird verarbeitet..." : (isLogin ? "Einloggen" : "Registrieren")}
          </Button>
          <div className="text-center">
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline text-sm" disabled={loading}>
              {isLogin ? "Noch kein Konto? Jetzt registrieren" : "Bereits registriert? Hier einloggen"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
