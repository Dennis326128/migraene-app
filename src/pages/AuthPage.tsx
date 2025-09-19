import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ensureUserProfile } from "@/utils/ensureUserProfile";

export default function AuthPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
          <Button onClick={handleAuth} className="w-full" disabled={loading}>
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
