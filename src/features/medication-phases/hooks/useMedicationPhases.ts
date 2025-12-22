/**
 * React Query hooks for medication phases
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPhasesForMedication,
  getActivePhase,
  getAllPhases,
  getLatestPhase,
  createPhase,
  updatePhase,
  endActivePhase,
  startNewPhase,
  deletePhase,
  type MedicationPhase,
  type CreatePhaseInput,
  type UpdatePhaseInput,
} from "../api/medicationPhases.api";

const PHASES_KEY = "medication-phases";

/**
 * Get all phases for a specific medication
 */
export function useMedicationPhases(medicationId: string | null) {
  return useQuery({
    queryKey: [PHASES_KEY, "medication", medicationId],
    queryFn: () => getPhasesForMedication(medicationId!),
    enabled: !!medicationId,
  });
}

/**
 * Get the active (current) phase for a medication
 */
export function useActivePhase(medicationId: string | null) {
  return useQuery({
    queryKey: [PHASES_KEY, "active", medicationId],
    queryFn: () => getActivePhase(medicationId!),
    enabled: !!medicationId,
  });
}

/**
 * Get all phases for all medications (for history/PDF)
 */
export function useAllPhases() {
  return useQuery({
    queryKey: [PHASES_KEY, "all"],
    queryFn: getAllPhases,
  });
}

/**
 * Get the most recent phase for a medication
 */
export function useLatestPhase(medicationId: string | null) {
  return useQuery({
    queryKey: [PHASES_KEY, "latest", medicationId],
    queryFn: () => getLatestPhase(medicationId!),
    enabled: !!medicationId,
  });
}

/**
 * Create a new phase
 */
export function useCreatePhase() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (input: CreatePhaseInput) => createPhase(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [PHASES_KEY] });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
  });
}

/**
 * Update a phase
 */
export function useUpdatePhase() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ phaseId, input }: { phaseId: string; input: UpdatePhaseInput }) =>
      updatePhase(phaseId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PHASES_KEY] });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
  });
}

/**
 * End the active phase (deactivate medication)
 */
export function useEndActivePhase() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      medicationId, 
      endDate, 
      stopReason 
    }: { 
      medicationId: string; 
      endDate: string; 
      stopReason?: string | null;
    }) => endActivePhase(medicationId, endDate, stopReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PHASES_KEY] });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
  });
}

/**
 * Start a new phase (reactivate medication)
 */
export function useStartNewPhase() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ medicationId, startDate }: { medicationId: string; startDate?: string }) =>
      startNewPhase(medicationId, startDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PHASES_KEY] });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
  });
}

/**
 * Delete a phase
 */
export function useDeletePhase() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (phaseId: string) => deletePhase(phaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PHASES_KEY] });
    },
  });
}

// Re-export types
export type { MedicationPhase, CreatePhaseInput, UpdatePhaseInput };
