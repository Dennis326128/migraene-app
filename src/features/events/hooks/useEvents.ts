import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createQuickPainEvent, recordMedEffect, getEvents, getPendingReminders, type QuickPainEventPayload, type MedEffectPayload } from "../api/events.api";

export function useCreateQuickPainEvent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (payload: QuickPainEventPayload) => createQuickPainEvent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] }); // Backward compatibility
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}

export function useRecordMedEffect() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (payload: MedEffectPayload) => recordMedEffect(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: getEvents,
  });
}

export function usePendingReminders() {
  return useQuery({
    queryKey: ["reminders"],
    queryFn: getPendingReminders,
    refetchInterval: 30000, // Check every 30 seconds for pending reminders
  });
}