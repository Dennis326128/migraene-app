import React, { useState, useEffect } from "react";
import { useNeedsConsent, useSaveMedicalDisclaimer } from "../hooks/useConsent";
import { HealthDataConsentModal } from "./HealthDataConsentModal";
import { MedicalDisclaimerModal } from "./MedicalDisclaimerModal";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isDisclaimerAcceptedLocally } from "../api/consent.api";

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

  // Fast local check: skip disclaimer modal if already accepted locally
  const [localDisclaimerOk] = useState(() => isDisclaimerAcceptedLocally());

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
  if (loadingTimedOut || consentError) {
    console.warn('[ConsentGate] Bypassing consent gate due to timeout/error');
    return <>{children}</>;
  }

  // Kurzes Loading (max 3 Sekunden) - dann Fallback
  // If local check says OK, skip loading spinner entirely
  if (isLoading && !localDisclaimerOk) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Einwilligungen werden geprüft...</p>
        </div>
      </div>
    );
  }

  // If still loading but local says OK → render children (server will confirm later)
  if (isLoading && localDisclaimerOk) {
    return <>{children}</>;
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
            // Close modal immediately (optimistic)
            setShowMedicalDisclaimer(false);
            try {
              await saveMedicalDisclaimer.mutateAsync();
            } catch (e) {
              console.error('[ConsentGate] Error saving medical disclaimer:', e);
              // Bei Fehler trotzdem fortfahren - App darf nicht blockiert werden
            }
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

  // Default: App rendern
  return <>{children}</>;
};
