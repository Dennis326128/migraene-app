import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { remindersApi } from '../api/reminders.api';
import type { CreateReminderInput, UpdateReminderInput } from '@/types/reminder.types';
import { toast } from '@/hooks/use-toast';

const QUERY_KEY = 'reminders';

export const useReminders = () => {
  return useQuery({
    queryKey: [QUERY_KEY, 'all'],
    queryFn: remindersApi.getAll,
  });
};

export const useTodayReminders = () => {
  return useQuery({
    queryKey: [QUERY_KEY, 'today'],
    queryFn: remindersApi.getToday,
  });
};

export const useUpcomingReminders = () => {
  return useQuery({
    queryKey: [QUERY_KEY, 'upcoming'],
    queryFn: remindersApi.getUpcoming,
  });
};

export const usePastReminders = () => {
  return useQuery({
    queryKey: [QUERY_KEY, 'past'],
    queryFn: remindersApi.getPast,
  });
};

export const useReminder = (id: string | null) => {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => id ? remindersApi.getById(id) : null,
    enabled: !!id,
  });
};

export const useCreateReminder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReminderInput) => remindersApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast({
        title: 'Erinnerung erstellt',
        description: 'Die Erinnerung wurde erfolgreich angelegt.',
      });
    },
    onError: (error) => {
      console.error('Failed to create reminder:', error);
      toast({
        title: 'Fehler',
        description: 'Erinnerung konnte nicht erstellt werden.',
        variant: 'destructive',
      });
    },
  });
};

export const useCreateMultipleReminders = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inputs: CreateReminderInput[]) => remindersApi.createMultiple(inputs),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast({
        title: 'Erinnerungen erstellt',
        description: `${data.length} Erinnerung(en) wurden erfolgreich angelegt.`,
      });
    },
    onError: (error) => {
      console.error('Failed to create reminders:', error);
      toast({
        title: 'Fehler',
        description: 'Erinnerungen konnten nicht erstellt werden.',
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateReminder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateReminderInput }) =>
      remindersApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast({
        title: 'Erinnerung aktualisiert',
        description: 'Die Änderungen wurden gespeichert.',
      });
    },
    onError: (error) => {
      console.error('Failed to update reminder:', error);
      toast({
        title: 'Fehler',
        description: 'Erinnerung konnte nicht aktualisiert werden.',
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteReminder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => remindersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast({
        title: 'Erinnerung gelöscht',
        description: 'Die Erinnerung wurde entfernt.',
      });
    },
    onError: (error) => {
      console.error('Failed to delete reminder:', error);
      toast({
        title: 'Fehler',
        description: 'Erinnerung konnte nicht gelöscht werden.',
        variant: 'destructive',
      });
    },
  });
};

export const useMarkReminderDone = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => remindersApi.markAsDone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast({
        title: 'Erledigt',
        description: 'Die Erinnerung wurde als erledigt markiert.',
      });
    },
  });
};

export const useMarkReminderMissed = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => remindersApi.markAsMissed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
};
