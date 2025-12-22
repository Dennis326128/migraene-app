import React, { useState, useEffect } from "react";
import { useNeedsConsent, useSaveMedicalDisclaimer } from "../hooks/useConsent";
import { HealthDataConsentModal } from "./HealthDataConsentModal";
import { MedicalDisclaimerModal } from "./MedicalDisclaimerModal";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ConsentGateProps {
  children: React.ReactNode;
}

// Timeout to prevent infinite loading (5 seconds)
const LOADING_TIMEOUT_MS = 5000;

/**
 * ConsentGate - Zentraler Gate-Wrapper für DSGVO-Compliance
 * 
 * Prüft nach Login:
 * 1. Medical Disclaimer akzeptiert?
 * 2. Health Data Consent erteilt und nicht widerrufen?
 * 
 * Blockiert App-Nutzung bis alle Einwilligungen vorliegen.
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

  // Timeout to prevent infinite loading
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      if (isLoading) {
        console.warn('[ConsentGate] Loading timed out, proceeding with consent flow');
        setLoadingTimedOut(true);
      }
    }, LOADING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [isLoading]);

  // If error or timeout occurred, treat as needing consent (show modals)
  const effectiveNeedsMedicalDisclaimer = error || loadingTimedOut ? true : needsMedicalDisclaimer;
  const effectiveNeedsHealthDataConsent = error || loadingTimedOut ? true : needsHealthDataConsent;
  const effectiveHasAllConsents = error || loadingTimedOut ? false : hasAllConsents;

  // Loading state - nur kurz anzeigen, nicht ewig
  if (isLoading && !loadingTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Einwilligungen werden geprüft...</p>
        </div>
      </div>
    );
  }

  // Step 1: Medical Disclaimer
  if (effectiveNeedsMedicalDisclaimer && showMedicalDisclaimer) {
    return (
      <MedicalDisclaimerModal
        open={true}
        onAccept={async () => {
          await saveMedicalDisclaimer.mutateAsync();
          setShowMedicalDisclaimer(false);
        }}
      />
    );
  }

  // Step 2: Health Data Consent
  if (effectiveNeedsHealthDataConsent && showHealthConsent) {
    return (
      <HealthDataConsentModal
        open={true}
        onConsentGiven={() => {
          setShowHealthConsent(false);
        }}
        onDecline={async () => {
          // Bei Ablehnung: Ausloggen und auf Info-Seite leiten
          await supabase.auth.signOut();
          navigate("/consent-required");
        }}
      />
    );
  }

  // All consents given - render app
  if (effectiveHasAllConsents || (!effectiveNeedsMedicalDisclaimer && !effectiveNeedsHealthDataConsent)) {
    return <>{children}</>;
  }

  // Fallback - sollte nicht passieren, aber sicherheitshalber children rendern
  // statt endlos laden
  console.warn('[ConsentGate] Unexpected state, rendering children as fallback');
  return <>{children}</>;
};
