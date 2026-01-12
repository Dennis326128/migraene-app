/**
 * AI Reports API
 * Fetches and manages persistent AI analysis reports from ai_reports table
 */

import { supabase } from "@/lib/supabaseClient";

export interface AIReport {
  id: string;
  user_id: string;
  report_type: 'diary_pdf' | 'pattern_analysis' | 'custom';
  title: string;
  from_date: string | null;
  to_date: string | null;
  source: 'pdf_flow' | 'analysis_view' | 'assistant';
  input_summary: Record<string, unknown> | null;
  response_json: Record<string, unknown>;
  model: string | null;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchAIReports(): Promise<AIReport[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('ai_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching AI reports:', error);
    throw error;
  }

  return (data || []) as AIReport[];
}

export async function fetchAIReportById(id: string): Promise<AIReport | null> {
  const { data, error } = await supabase
    .from('ai_reports')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return data as AIReport;
}

export async function deleteAIReport(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_reports')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export interface CreateAIReportInput {
  report_type: 'diary_pdf' | 'pattern_analysis' | 'custom';
  title: string;
  from_date?: string | null;
  to_date?: string | null;
  source: 'pdf_flow' | 'analysis_view' | 'assistant';
  input_summary?: Record<string, unknown> | null;
  response_json: Record<string, unknown>;
  model?: string | null;
  dedupe_key?: string | null;
}

export async function createAIReport(input: CreateAIReportInput): Promise<AIReport> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht angemeldet');

  const { data, error } = await supabase
    .from('ai_reports')
    .insert({
      user_id: user.id,
      ...input,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AIReport;
}

export async function upsertAIReportByDedupeKey(input: CreateAIReportInput): Promise<AIReport> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht angemeldet');

  // If no dedupe key, just create
  if (!input.dedupe_key) {
    return createAIReport(input);
  }

  // Try to find existing
  const { data: existing } = await supabase
    .from('ai_reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('dedupe_key', input.dedupe_key)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('ai_reports')
      .update({
        title: input.title,
        response_json: input.response_json,
        input_summary: input.input_summary,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data as AIReport;
  }

  // Create new
  return createAIReport(input);
}
