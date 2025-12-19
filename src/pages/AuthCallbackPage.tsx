import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { ensureUserProfile } from "@/utils/ensureUserProfile";
import { useToast } from "@/hooks/use-toast";

/**
 * OAuth Callback Handler
 * Handles the redirect from OAuth providers (Google, etc.)
 * Extracts session from URL hash and redirects to app
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get session from URL (Supabase puts tokens in hash)
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("[AuthCallback] Session error:", sessionError);
          setError("Authentifizierung fehlgeschlagen. Bitte erneut versuchen.");
          return;
        }

        if (data.session) {
          // User is authenticated - ensure profile exists
          await ensureUserProfile();
          
          toast({
            title: "Erfolgreich angemeldet",
            description: "Willkommen zurück!",
          });

          // Redirect to main app
          navigate("/", { replace: true });
        } else {
          // No session - check for error in URL params
          const params = new URLSearchParams(window.location.search);
          const errorParam = params.get("error");
          const errorDescription = params.get("error_description");

          if (errorParam) {
            console.error("[AuthCallback] OAuth error:", errorParam, errorDescription);
            setError(errorDescription || "Anmeldung fehlgeschlagen.");
          } else {
            // No session and no error - redirect to auth
            navigate("/auth", { replace: true });
          }
        }
      } catch (err) {
        console.error("[AuthCallback] Unexpected error:", err);
        setError("Ein unerwarteter Fehler ist aufgetreten.");
      }
    };

    handleAuthCallback();
  }, [navigate, toast]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-destructive text-6xl">⚠️</div>
          <h1 className="text-xl font-semibold text-foreground">Anmeldung fehlgeschlagen</h1>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate("/auth", { replace: true })}
            className="text-primary hover:underline"
          >
            Zurück zur Anmeldung
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-sm text-muted-foreground">Anmeldung wird abgeschlossen...</p>
      </div>
    </div>
  );
}
