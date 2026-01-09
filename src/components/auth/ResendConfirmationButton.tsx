import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useResendCooldown } from "@/hooks/useResendCooldown";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Loader2, Mail, Clock, AlertTriangle } from "lucide-react";

interface ResendConfirmationButtonProps {
  email: string;
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

export function ResendConfirmationButton({
  email,
  variant = "outline",
  className,
}: ResendConfirmationButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const {
    canResend,
    remainingSeconds,
    formattedTime,
    isLocked,
    attemptCount,
    recordAttempt,
  } = useResendCooldown();

  const handleResend = async () => {
    if (!canResend || isLoading || !email) return;

    setIsLoading(true);

    try {
      // Rufe Edge Function auf
      const { error } = await supabase.functions.invoke("resend-confirmation", {
        body: { email },
      });

      if (error) {
        console.error("[ResendConfirmation] Edge function error:", error);
        toast.error("Es gab ein Problem. Bitte versuche es später erneut.");
      } else {
        // Generische Erfolgsmeldung (Anti-Enumeration)
        toast.success(
          "Wenn ein Konto mit dieser E-Mail existiert, haben wir dir eine Bestätigungsmail gesendet."
        );
        // Cooldown starten
        recordAttempt();
      }
    } catch (err) {
      console.error("[ResendConfirmation] Unexpected error:", err);
      toast.error("Es gab ein Problem. Bitte versuche es später erneut.");
    } finally {
      setIsLoading(false);
    }
  };

  // Lockout-Zustand
  if (isLocked) {
    return (
      <div className="space-y-2 text-center">
        <Button
          variant={variant}
          className={className}
          disabled
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Zu viele Versuche
        </Button>
        <p className="text-xs text-muted-foreground">
          Bitte warte {formattedTime} oder{" "}
          <a
            href="mailto:support@migraene-app.de"
            className="text-primary hover:underline"
          >
            kontaktiere den Support
          </a>
        </p>
      </div>
    );
  }

  // Cooldown aktiv
  if (!canResend && remainingSeconds > 0) {
    return (
      <Button
        variant={variant}
        className={className}
        disabled
      >
        <Clock className="h-4 w-4 mr-2" />
        Erneut senden in {formattedTime}
      </Button>
    );
  }

  // Normal Button
  return (
    <Button
      variant={variant}
      className={className}
      onClick={handleResend}
      disabled={isLoading || !email}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Wird gesendet...
        </>
      ) : (
        <>
          <Mail className="h-4 w-4 mr-2" />
          E-Mail erneut senden
        </>
      )}
    </Button>
  );
}
