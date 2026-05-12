import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * AI Processing Consent Toggle (DSGVO Art. 9)
 *
 * Lets the user explicitly opt-in to AI-based analysis of their data.
 * When disabled, all AI edge functions return 403 (server-side gate).
 */
export interface AIConsentToggleProps {
  onChanged?: (enabled: boolean) => void;
}

export const AIConsentToggle = ({ onChanged }: AIConsentToggleProps = {}) => {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("user_consents")
          .select("ai_processing_consent")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setEnabled(Boolean((data as any)?.ai_processing_consent));
      } catch (e) {
        console.warn("[AIConsentToggle] load error", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      const { data: existing } = await supabase
        .from("user_consents")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const payload: any = {
        ai_processing_consent: next,
        ai_processing_consent_at: next ? new Date().toISOString() : null,
        ai_processing_consent_version: "1.0",
        // When (re-)activating AI consent, clear any prior withdrawal so
        // has_ai_consent() (which filters consent_withdrawn_at IS NULL) returns true.
        ...(next ? { consent_withdrawn_at: null, withdrawal_reason: null } : {}),
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("user_consents")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_consents")
          .insert({ user_id: user.id, ...payload });
        if (error) throw error;
      }

      setEnabled(next);
      onChanged?.(next);
      toast({
        title: next ? "KI-Analyse aktiviert" : "KI-Analyse deaktiviert",
        description: next
          ? "Du kannst jetzt KI-Berichte und Muster-Analysen nutzen."
          : "KI-Funktionen sind nun blockiert.",
      });
    } catch (e: any) {
      console.error("[AIConsentToggle] save error", e);
      toast({
        title: "Fehler",
        description: e?.message ?? "Speichern fehlgeschlagen",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={cn("p-6", isMobile && "p-4")}>
      <div className="flex items-start gap-3 mb-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1">
          <Label
            htmlFor="ai-consent-toggle"
            className={cn("text-base font-medium block", isMobile && "text-sm")}
          >
            KI-gestützte Analyse aktivieren
          </Label>
          <p className={cn("text-sm text-muted-foreground mt-1", isMobile && "text-xs")}>
            Für KI-Berichte und Muster-Analysen werden deine anonymisierten
            Einträge an externe KI-Dienste übermittelt.
          </p>
        </div>
        <div className="shrink-0 pt-1">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              id="ai-consent-toggle"
              checked={enabled}
              disabled={saving}
              onCheckedChange={handleToggle}
            />
          )}
        </div>
      </div>
    </Card>
  );
};
