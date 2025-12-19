import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUserConsent,
  saveHealthDataConsent,
  saveMedicalDisclaimerAccepted,
  withdrawHealthDataConsent,
  hasValidHealthDataConsent,
  UserConsent,
} from "../api/consent.api";

const CONSENT_KEY = ["user-consent"];

export function useConsent() {
  return useQuery({
    queryKey: CONSENT_KEY,
    queryFn: getUserConsent,
    staleTime: 5 * 60 * 1000,
  });
}

export function useHealthDataConsentStatus() {
  return useQuery({
    queryKey: [...CONSENT_KEY, "health-data-valid"],
    queryFn: hasValidHealthDataConsent,
    staleTime: 5 * 60 * 1000,
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

export function useNeedsHealthDataConsent() {
  const { data: consent, isLoading } = useConsent();

  const needsConsent = !isLoading && (
    !consent || 
    consent.health_data_consent !== true || 
    consent.consent_withdrawn_at !== null
  );

  return { needsConsent, isLoading };
}
