/**
 * DoctorCodeEntry
 * Öffentliche Seite für Ärzte zur Code-Eingabe
 * Route: /doctor
 */

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Lock, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DoctorCodeEntry: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expired-Message aus URL
  const expired = searchParams.get("expired") === "1";

  // Auto-Focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Code formatieren (Auto-Bindestrich)
  const formatCode = (input: string): string => {
    const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length <= 4) return clean;
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCode(e.target.value);
    setCode(formatted);
    setError(null);
  };

  // Validierung
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (code.replace(/-/g, "").length < 8) {
      setError("Bitte geben Sie den vollständigen 8-stelligen Code ein");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/validate-doctor-share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
        credentials: "include", // Wichtig für Cookie
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        setError(data.error || "Code ungültig");
        setIsValidating(false);
        return;
      }

      // Erfolg → zur Ansicht navigieren
      toast.success("Zugang gewährt");
      navigate("/doctor/view");
    } catch (err) {
      console.error("Validation error:", err);
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-semibold text-lg">Migräne-App</h1>
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ExternalLink className="w-4 h-4" />
            Zur Website
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-8 h-8 text-primary" />
              </div>
            </div>

            {/* Title */}
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">Patientenbericht einsehen</h2>
              <p className="text-sm text-muted-foreground">
                Bitte geben Sie den Freigabe-Code Ihres Patienten ein.
              </p>
            </div>

            {/* Expired Message */}
            {expired && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm">
                  Die vorherige Sitzung ist abgelaufen. Bitte geben Sie den Code erneut ein.
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  ref={inputRef}
                  type="text"
                  value={code}
                  onChange={handleCodeChange}
                  placeholder="XXXX-0000"
                  className="text-center text-2xl font-mono tracking-wider h-14"
                  maxLength={9}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isValidating}
                />
                {error && (
                  <p className="mt-2 text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isValidating || code.replace(/-/g, "").length < 8}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Wird geprüft...
                  </>
                ) : (
                  "Code prüfen"
                )}
              </Button>
            </form>

            {/* Info */}
            <p className="text-xs text-center text-muted-foreground">
              Der Code ist 24 Stunden gültig und wird vom Patienten erstellt.
            </p>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t py-4">
        <div className="max-w-md mx-auto px-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <a href="/privacy" className="hover:underline">Datenschutz</a>
          <span>•</span>
          <a href="/imprint" className="hover:underline">Impressum</a>
          <span>•</span>
          <span>© {new Date().getFullYear()} Migräne-App</span>
        </div>
      </footer>
    </div>
  );
};

export default DoctorCodeEntry;
