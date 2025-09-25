import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

export interface MedicationLimit {
  id: string;
  user_id: string;
  medication_name: string;
  limit_count: number;
  period_type: 'day' | 'week' | 'month';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMedicationLimitPayload {
  medication_name: string;
  limit_count: number;
  period_type: 'day' | 'week' | 'month';
  is_active?: boolean;
}

export interface LimitCheck {
  medication_name: string;
  current_count: number;
  limit_count: number;
  period_type: string;
  percentage: number;
  status: 'safe' | 'warning' | 'reached' | 'exceeded';
  period_start: string;
}

async function getMedicationLimits(): Promise<MedicationLimit[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_medication_limits')
    .select('*')
    .eq('user_id', user.id)
    .order('medication_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function createMedicationLimit(payload: CreateMedicationLimitPayload): Promise<MedicationLimit> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Kein Nutzer');

  const { data, error } = await supabase
    .from('user_medication_limits')
    .insert({
      user_id: user.id,
      ...payload
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateMedicationLimit(
  id: string, 
  payload: Partial<CreateMedicationLimitPayload>
): Promise<MedicationLimit> {
  const { data, error } = await supabase
    .from('user_medication_limits')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteMedicationLimit(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_medication_limits')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

async function checkMedicationLimits(medications: string[]): Promise<LimitCheck[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Nicht authentifiziert');

  const { data, error } = await supabase.functions.invoke('check-medication-limits', {
    body: { medications },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  return data || [];
}

export function useMedicationLimits() {
  return useQuery({
    queryKey: ["medication-limits"],
    queryFn: getMedicationLimits,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateMedicationLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMedicationLimit,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medication-limits"] });
    },
  });
}

export function useUpdateMedicationLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateMedicationLimitPayload> }) =>
      updateMedicationLimit(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medication-limits"] });
    },
  });
}

export function useDeleteMedicationLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteMedicationLimit,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medication-limits"] });
    },
  });
}

export function useCheckMedicationLimits() {
  return useMutation({
    mutationFn: checkMedicationLimits,
  });
}