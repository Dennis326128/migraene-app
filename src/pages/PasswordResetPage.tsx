import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { z } from "zod";

const passwordSchema = z.string()
  .min(8, "Passwort muss mindestens 8 Zeichen lang sein")
  .regex(/[A-Z]/, "Passwort muss mindestens einen Großbuchstaben enthalten")
  .regex(/[a-z]/, "Passwort muss mindestens einen Kleinbuchstaben enthalten")
  .regex(/[0-9]/, "Passwort muss mindestens eine Zahl enthalten");

export default function PasswordResetPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const [resetComplete, setResetComplete] = useState(false);

  useEffect(() => {
    // Check if we have a valid recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      // User should have a recovery session to reset password
      if (session) {
        setIsValidToken(true);
      } else {
        setIsValidToken(false);
      }
    });
  }, []);

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({ 
        title: "Fehler", 
        description: "Bitte beide Felder ausfüllen.", 
        variant: "destructive" 
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ 
        title: "Fehler", 
        description: "Die Passwörter stimmen nicht überein.", 
        variant: "destructive" 
      });
      return;
    }

    // Validate password strength
    try {
      passwordSchema.parse(newPassword);
    } catch (validationError: any) {
      toast({ 
        title: "Schwaches Passwort", 
        description: validationError.errors[0]?.message || "Passwort erfüllt nicht die Anforderungen",
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      toast({ 
        title: "Fehler", 
        description: error.message, 
        variant: "destructive" 
      });
    } else {
      setResetComplete(true);
      toast({
        title: "Passwort erfolgreich geändert",
        description: "Sie werden zum Login weitergeleitet...",
      });
      setTimeout(() => {
        navigate("/auth");
      }, 2000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleResetPassword();
  };

  if (isValidToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Wird geladen...</p>
        </div>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <AlertCircle className="w-12 h-12 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-bold text-center">
              Ungültiger Link
            </CardTitle>
            <CardDescription className="text-center">
              Dieser Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link zur Passwortwiederherstellung an.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => navigate("/auth")} 
              className="w-full"
            >
              Zurück zum Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (resetComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-center">
              Passwort erfolgreich geändert
            </CardTitle>
            <CardDescription className="text-center">
              Sie können sich jetzt mit Ihrem neuen Passwort einloggen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => navigate("/auth")} 
              className="w-full"
            >
              Zum Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Neues Passwort festlegen
          </CardTitle>
          <CardDescription className="text-center">
            Bitte wählen Sie ein sicheres neues Passwort
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="newPassword" className="mb-1 block">Neues Passwort</Label>
            <Input 
              id="newPassword" 
              type="password" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
              onKeyPress={handleKeyPress} 
              disabled={loading}
              placeholder="Mindestens 8 Zeichen"
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword" className="mb-1 block">Passwort bestätigen</Label>
            <Input 
              id="confirmPassword" 
              type="password" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              onKeyPress={handleKeyPress} 
              disabled={loading}
              placeholder="Passwort wiederholen"
            />
          </div>
          
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Passwortanforderungen:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>• Mindestens 8 Zeichen</li>
              <li>• Mindestens ein Großbuchstabe</li>
              <li>• Mindestens ein Kleinbuchstabe</li>
              <li>• Mindestens eine Zahl</li>
            </ul>
          </div>

          <Button 
            onClick={handleResetPassword} 
            className="w-full" 
            disabled={loading}
          >
            {loading ? "Wird gespeichert..." : "Passwort ändern"}
          </Button>
          
          <div className="text-center">
            <button 
              onClick={() => navigate("/auth")} 
              className="text-muted-foreground hover:text-foreground text-sm"
              disabled={loading}
            >
              Abbrechen
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
