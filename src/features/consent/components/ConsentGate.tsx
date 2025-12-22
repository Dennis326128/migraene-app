import React, { useState, useEffect } from "react";
import { useNeedsConsent, useSaveMedicalDisclaimer } from "../hooks/useConsent";
import { HealthDataConsentModal } from "./HealthDataConsentModal";
import { MedicalDisclaimerModal } from "./MedicalDisclaimerModal";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ConsentGateProps {
  children: React.ReactNode;
}

// KRITISCH: Kurzes Timeout - App darf NIEMALS blockiert werden
const LOADING_TIMEOUT_MS = 3000;

/**
 * ConsentGate - Zentraler Gate-Wrapper für DSGVO-Compliance
 * 
 * KRITISCHE REGEL: Dieser Gate darf die App NIEMALS blockieren.
 * Bei jedem Fehler, Timeout oder unerwarteten Zustand → children rendern.
 * 
 * Consent-Modals werden angezeigt, aber blockieren NIE das App-Rendering.
 */
export const ConsentGate: React.FC<ConsentGateProps> = ({ children }) => {
  const navigate = useNavigate();
  const {
    isLoading,
    error,
    needsMedicalDisclaimer,
    needsHealthDataConsent,
    isWithdrawn,
    hasAllConsents,
  } = useNeedsConsent();

  const saveMedicalDisclaimer = useSaveMedicalDisclaimer();
  const [showMedicalDisclaimer, setShowMedicalDisclaimer] = useState(true);
  const [showHealthConsent, setShowHealthConsent] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [consentError, setConsentError] = useState(false);

  // KRITISCH: Timeout - App darf nicht hängen
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      if (isLoading) {
        console.warn('[ConsentGate] Loading timed out - rendering app anyway');
        setLoadingTimedOut(true);
      }
    }, LOADING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [isLoading]);

  // Bei Fehler: App rendern, nicht blockieren
  useEffect(() => {
    if (error) {
      console.warn('[ConsentGate] Error loading consent status - rendering app anyway:', error);
      setConsentError(true);
    }
  }, [error]);

  // KRITISCHE REGEL: Bei Timeout oder Fehler → App rendern
  // Consent-Modals können später gezeigt werden, aber App muss funktionieren
  if (loadingTimedOut || consentError) {
    console.warn('[ConsentGate] Bypassing consent gate due to timeout/error');
    return <>{children}</>;
  }

  // Kurzes Loading (max 3 Sekunden) - dann Fallback
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Einwilligungen werden geprüft...</p>
        </div>
      </div>
    );
  }

  // Wenn alle Consents vorhanden → App rendern
  if (hasAllConsents) {
    return <>{children}</>;
  }

  // Step 1: Medical Disclaimer (als Modal ÜBER der App, nicht blockierend)
  if (needsMedicalDisclaimer && showMedicalDisclaimer) {
    return (
      <>
        {children}
        <MedicalDisclaimerModal
          open={true}
          onAccept={async () => {
            try {
              await saveMedicalDisclaimer.mutateAsync();
            } catch (e) {
              console.error('[ConsentGate] Error saving medical disclaimer:', e);
              // Bei Fehler trotzdem fortfahren - App darf nicht blockiert werden
            }
            setShowMedicalDisclaimer(false);
          }}
        />
      </>
    );
  }

  // Step 2: Health Data Consent (als Modal ÜBER der App, nicht blockierend)
  if (needsHealthDataConsent && showHealthConsent) {
    return (
      <>
        {children}
        <HealthDataConsentModal
          open={true}
          onConsentGiven={() => {
            setShowHealthConsent(false);
          }}
          onDecline={async () => {
            // Bei Ablehnung: Ausloggen und auf Info-Seite leiten
            try {
              await supabase.auth.signOut();
            } catch (e) {
              console.error('[ConsentGate] Error signing out:', e);
            }
            navigate("/consent-required");
          }}
        />
      </>
    );
  }

  // Default: App rendern (sollte nach Consent-Abschluss erreicht werden)
  return <>{children}</>;
};
