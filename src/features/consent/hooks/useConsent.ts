import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUserConsent,
  saveHealthDataConsent,
  saveMedicalDisclaimerAccepted,
  withdrawHealthDataConsent,
  getConsentStatus,
  ConsentStatus,
} from "../api/consent.api";

const CONSENT_KEY = ["user-consent"];

export function useConsent() {
  return useQuery({
    queryKey: CONSENT_KEY,
    queryFn: getUserConsent,
    staleTime: 5 * 60 * 1000,
  });
}

export function useConsentStatus() {
  return useQuery({
    queryKey: [...CONSENT_KEY, "status"],
    queryFn: getConsentStatus,
    staleTime: 30 * 1000, // Refresh more often for gate checks
  });
}

export function useSaveHealthDataConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveHealthDataConsent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSENT_KEY });
    },
  });
}

export function useSaveMedicalDisclaimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveMedicalDisclaimerAccepted,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSENT_KEY });
    },
  });
}

export function useWithdrawConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: withdrawHealthDataConsent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONSENT_KEY });
    },
  });
}

/**
 * Hook für ConsentGate - prüft ob alle Einwilligungen vorhanden sind
 */
export function useNeedsConsent() {
  const { data: status, isLoading, error } = useConsentStatus();

  return {
    isLoading,
    error,
    needsMedicalDisclaimer: status?.needsMedicalDisclaimer ?? false,
    needsHealthDataConsent: status?.needsHealthDataConsent ?? false,
    isWithdrawn: status?.isWithdrawn ?? false,
    hasAllConsents: status?.hasConsent ?? false,
  };
}
