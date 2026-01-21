/**
 * Daily Impact Check API
 * Alltagsbelastung durch Kopfschmerzen - Datenbank-Operationen
 */

import { supabase } from '@/lib/supabaseClient';
import { DailyImpactAnswers, DailyImpactQuestionKey } from './dailyImpact.constants';

export interface DailyImpactAssessment {
  id: string;
  user_id: string;
  created_at: string;
  period_start_date: string;
  period_end_date: string;
  answers: Record<string, number>;
  score: number;
  external_hit6_score: number | null;
  external_hit6_date: string | null;
  pdf_last_generated_at: string | null;
}

export interface CreateDailyImpactInput {
  answers: DailyImpactAnswers;
  score: number;
  external_hit6_score?: number | null;
  external_hit6_date?: string | null;
  period_start_date?: string;
  period_end_date?: string;
}

export async function createDailyImpactAssessment(input: CreateDailyImpactInput): Promise<DailyImpactAssessment> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Nicht angemeldet');
  }

  const today = new Date();
  const periodEnd = input.period_end_date || today.toISOString().slice(0, 10);
  const periodStart = input.period_start_date || new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Convert answers to plain object for JSONB storage
  const answersJson: Record<string, number> = {};
  (Object.keys(input.answers) as DailyImpactQuestionKey[]).forEach(key => {
    const answer = input.answers[key];
    if (answer !== null) {
      answersJson[key] = answer;
    }
  });

  const { data, error } = await supabase
    .from('daily_impact_assessments')
    .insert({
      user_id: userData.user.id,
      answers: answersJson,
      score: input.score,
      period_end_date: periodEnd,
      period_start_date: periodStart,
      external_hit6_score: input.external_hit6_score || null,
      external_hit6_date: input.external_hit6_date || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating daily impact assessment:', error);
    throw new Error('Fehler beim Speichern der Selbsteinschätzung');
  }

  return data as DailyImpactAssessment;
}

export async function fetchDailyImpactAssessments(): Promise<DailyImpactAssessment[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data, error } = await supabase
    .from('daily_impact_assessments')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching daily impact assessments:', error);
    throw error;
  }

  return (data || []) as DailyImpactAssessment[];
}

export async function fetchLatestDailyImpactAssessment(): Promise<DailyImpactAssessment | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('daily_impact_assessments')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows found
    throw error;
  }

  return data as DailyImpactAssessment;
}
