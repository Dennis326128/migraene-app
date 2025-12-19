import React, { useState } from "react";
import { useNeedsConsent, useSaveMedicalDisclaimer } from "../hooks/useConsent";
import { HealthDataConsentModal } from "./HealthDataConsentModal";
import { MedicalDisclaimerModal } from "./MedicalDisclaimerModal";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ConsentGateProps {
  children: React.ReactNode;
}

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
    needsMedicalDisclaimer,
    needsHealthDataConsent,
    isWithdrawn,
    hasAllConsents,
  } = useNeedsConsent();

  const saveMedicalDisclaimer = useSaveMedicalDisclaimer();
  const [showMedicalDisclaimer, setShowMedicalDisclaimer] = useState(true);
  const [showHealthConsent, setShowHealthConsent] = useState(true);

  // Loading state - keine UI-Flicker
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

  // Step 1: Medical Disclaimer
  if (needsMedicalDisclaimer && showMedicalDisclaimer) {
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
  if (needsHealthDataConsent && showHealthConsent) {
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
  if (hasAllConsents) {
    return <>{children}</>;
  }

  // Fallback loading (shouldn't happen)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-sm text-muted-foreground">Lade...</p>
      </div>
    </div>
  );
};
