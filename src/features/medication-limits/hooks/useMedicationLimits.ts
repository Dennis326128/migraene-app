import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { fetchMedicationLimitUsages } from "@/features/medication-intakes/api/medicationSummary.api";
import { getLimitStatus } from "@/lib/utils/medicationLimitStatus";

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

  // Get medication ID from name
  const { data: medData } = await supabase
    .from('user_medications')
    .select('id')
    .eq('user_id', user.id)
    .eq('name', payload.medication_name)
    .single();

  const { data, error } = await supabase
    .from('user_medication_limits')
    .insert({
      user_id: user.id,
      ...payload,
      medication_id: medData?.id || null, // NEW: Populate ID alongside name
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
  const updates: any = { ...payload };

  // If medication_name is updated, also update medication_id
  if (payload.medication_name) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: medData } = await supabase
        .from('user_medications')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', payload.medication_name)
        .single();
      
      updates.medication_id = medData?.id || null;
    }
  }

  const { data, error } = await supabase
    .from('user_medication_limits')
    .update(updates)
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
  const limits = (await getMedicationLimits()).filter(
    (limit) => limit.is_active && medications.includes(limit.medication_name)
  );

  const usages = await fetchMedicationLimitUsages(limits.map((limit) => ({
    medication_name: limit.medication_name,
    period_type: limit.period_type,
    limit_count: limit.limit_count,
  })));

  return usages.map((usage) => ({
    medication_name: usage.medication_name,
    current_count: usage.current_count,
    limit_count: usage.limit_count,
    period_type: usage.period_type,
    percentage: usage.limit_count > 0 ? Math.round((usage.current_count / usage.limit_count) * 100) : 0,
    status: getLimitStatus(usage.current_count, usage.limit_count),
    period_start: usage.period_start,
  }));
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