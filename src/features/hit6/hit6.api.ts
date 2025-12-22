import { supabase } from '@/integrations/supabase/client';
import type { Hit6Answers, Hit6QuestionKey } from './hit6.constants';

export interface Hit6Assessment {
  id: string;
  user_id: string;
  created_at: string;
  period_end_date: string;
  period_start_date: string;
  answers: Record<string, string>;
  score: number;
  pdf_last_generated_at: string | null;
}

export interface CreateHit6AssessmentInput {
  answers: Hit6Answers;
  score: number;
  period_end_date?: string;
  period_start_date?: string;
}

/**
 * Create a new HIT-6 assessment
 */
export async function createHit6Assessment(input: CreateHit6AssessmentInput): Promise<Hit6Assessment> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Nicht angemeldet');
  }

  const today = new Date();
  const periodEnd = input.period_end_date || today.toISOString().slice(0, 10);
  const periodStart = input.period_start_date || new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Convert answers to plain object for JSONB storage
  const answersJson: Record<string, string> = {};
  (Object.keys(input.answers) as Hit6QuestionKey[]).forEach(key => {
    const answer = input.answers[key];
    if (answer) {
      answersJson[key] = answer;
    }
  });

  const { data, error } = await supabase
    .from('hit6_assessments')
    .insert({
      user_id: userData.user.id,
      answers: answersJson,
      score: input.score,
      period_end_date: periodEnd,
      period_start_date: periodStart,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating HIT-6 assessment:', error);
    throw new Error('Fehler beim Speichern des HIT-6 Fragebogens');
  }

  return data as Hit6Assessment;
}

/**
 * Get all HIT-6 assessments for the current user
 */
export async function getHit6Assessments(): Promise<Hit6Assessment[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return [];
  }

  const { data, error } = await supabase
    .from('hit6_assessments')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching HIT-6 assessments:', error);
    return [];
  }

  return (data || []) as Hit6Assessment[];
}

/**
 * Update PDF generated timestamp
 */
export async function updateHit6PdfGenerated(assessmentId: string): Promise<void> {
  const { error } = await supabase
    .from('hit6_assessments')
    .update({ pdf_last_generated_at: new Date().toISOString() })
    .eq('id', assessmentId);

  if (error) {
    console.error('Error updating PDF timestamp:', error);
  }
}
