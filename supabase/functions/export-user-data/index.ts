import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[export-user-data] No authorization header');
      return new Response(
        JSON.stringify({ error: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[export-user-data] User auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Benutzer nicht gefunden' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[export-user-data] Starting export for user: ${user.id}`);

    // Initialize export data structure
    const exportData: Record<string, any> = {
      export_info: {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        email: user.email,
        format: 'DSGVO Art. 20 - Recht auf Datenübertragbarkeit',
        version: '2.0',
      },
      tables: {}
    };

    // Helper function to safely fetch table data
    const fetchTable = async (tableName: string, select: string = '*', filter?: { column: string; value: any; operator?: string }) => {
      try {
        let query = supabase.from(tableName).select(select);
        
        if (filter) {
          if (filter.operator === 'in') {
            query = query.in(filter.column, filter.value);
          } else {
            query = query.eq(filter.column, filter.value);
          }
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.warn(`[export-user-data] Error fetching ${tableName}:`, error.message);
          return { error: error.message, count: 0, data: [] };
        }
        
        return { count: data?.length || 0, data: data || [] };
      } catch (err) {
        console.warn(`[export-user-data] Exception fetching ${tableName}:`, err);
        return { error: String(err), count: 0, data: [] };
      }
    };

    // ========================================
    // PHASE 1: Direct user_id tables (parallel)
    // ========================================
    const [
      userProfiles,
      userConsents,
      patientData,
      doctors,
      painEntries,
      voiceNotes,
      voiceEntriesDebug,
      userMedications,
      medicationCourses,
      userMedicationLimits,
      reminders,
      pushSubscriptions,
      weatherLogs,
      userReportSettings,
      userAiUsage,
      aiReports,
      hit6Assessments,
      userFeedback
    ] = await Promise.all([
      fetchTable('user_profiles', '*', { column: 'user_id', value: user.id }),
      fetchTable('user_consents', '*', { column: 'user_id', value: user.id }),
      fetchTable('patient_data', '*', { column: 'user_id', value: user.id }),
      fetchTable('doctors', '*', { column: 'user_id', value: user.id }),
      fetchTable('pain_entries', '*', { column: 'user_id', value: user.id }),
      fetchTable('voice_notes', '*', { column: 'user_id', value: user.id }),
      fetchTable('voice_entries_debug', '*', { column: 'user_id', value: user.id }),
      fetchTable('user_medications', '*', { column: 'user_id', value: user.id }),
      fetchTable('medication_courses', '*', { column: 'user_id', value: user.id }),
      fetchTable('user_medication_limits', '*', { column: 'user_id', value: user.id }),
      fetchTable('reminders', '*', { column: 'user_id', value: user.id }),
      fetchTable('push_subscriptions', '*', { column: 'user_id', value: user.id }),
      fetchTable('weather_logs', '*', { column: 'user_id', value: user.id }),
      fetchTable('user_report_settings', '*', { column: 'user_id', value: user.id }),
      fetchTable('user_ai_usage', '*', { column: 'user_id', value: user.id }),
      fetchTable('ai_reports', '*', { column: 'user_id', value: user.id }),
      fetchTable('hit6_assessments', '*', { column: 'user_id', value: user.id }),
      fetchTable('user_feedback', '*', { column: 'user_id', value: user.id }),
    ]);

    // Store direct tables
    exportData.tables.user_profiles = userProfiles;
    exportData.tables.user_consents = userConsents;
    exportData.tables.patient_data = patientData;
    exportData.tables.doctors = doctors;
    exportData.tables.pain_entries = painEntries;
    exportData.tables.voice_notes = voiceNotes;
    exportData.tables.voice_entries_debug = voiceEntriesDebug;
    exportData.tables.user_medications = userMedications;
    exportData.tables.medication_courses = medicationCourses;
    exportData.tables.user_medication_limits = userMedicationLimits;
    exportData.tables.reminders = reminders;
    exportData.tables.push_subscriptions = pushSubscriptions;
    exportData.tables.weather_logs = weatherLogs;
    exportData.tables.user_report_settings = userReportSettings;
    exportData.tables.user_ai_usage = userAiUsage;
    exportData.tables.ai_reports = aiReports;
    exportData.tables.hit6_assessments = hit6Assessments;
    exportData.tables.user_feedback = userFeedback;

    // ========================================
    // PHASE 2: Linked tables (via pain_entries)
    // ========================================
    const entryIds = (painEntries.data || []).map((e: any) => e.id);
    
    if (entryIds.length > 0) {
      const [entrySymptoms, medicationEffects, medicationIntakes] = await Promise.all([
        fetchTable('entry_symptoms', '*', { column: 'entry_id', value: entryIds, operator: 'in' }),
        fetchTable('medication_effects', '*', { column: 'entry_id', value: entryIds, operator: 'in' }),
        fetchTable('medication_intakes', '*', { column: 'entry_id', value: entryIds, operator: 'in' }),
      ]);
      
      exportData.tables.entry_symptoms = entrySymptoms;
      exportData.tables.medication_effects = medicationEffects;
      exportData.tables.medication_intakes = medicationIntakes;
    } else {
      exportData.tables.entry_symptoms = { count: 0, data: [] };
      exportData.tables.medication_effects = { count: 0, data: [] };
      exportData.tables.medication_intakes = { count: 0, data: [] };
    }

    // ========================================
    // PHASE 3: Linked tables (via voice_notes)
    // ========================================
    const voiceNoteIds = (voiceNotes.data || []).map((v: any) => v.id);
    
    if (voiceNoteIds.length > 0) {
      const voiceNoteSegments = await fetchTable('voice_note_segments', '*', { 
        column: 'voice_note_id', 
        value: voiceNoteIds, 
        operator: 'in' 
      });
      exportData.tables.voice_note_segments = voiceNoteSegments;
    } else {
      exportData.tables.voice_note_segments = { count: 0, data: [] };
    }

    // ========================================
    // PHASE 4: Linked tables (via user_medications)
    // ========================================
    const medicationIds = (userMedications.data || []).map((m: any) => m.id);
    
    if (medicationIds.length > 0) {
      const medicationPhases = await fetchTable('medication_phases', '*', { 
        column: 'medication_id', 
        value: medicationIds, 
        operator: 'in' 
      });
      exportData.tables.medication_phases = medicationPhases;
    } else {
      exportData.tables.medication_phases = { count: 0, data: [] };
    }

    // ========================================
    // Calculate totals
    // ========================================
    let totalRecords = 0;
    for (const [tableName, tableData] of Object.entries(exportData.tables)) {
      if (typeof tableData === 'object' && tableData !== null && 'count' in tableData) {
        totalRecords += (tableData as any).count;
      }
    }
    exportData.export_info.total_records = totalRecords;
    exportData.export_info.tables_exported = Object.keys(exportData.tables).length;

    console.log(`[export-user-data] Export complete. Total records: ${totalRecords}, Tables: ${Object.keys(exportData.tables).length}`);

    return new Response(
      JSON.stringify(exportData, null, 2),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="dsgvo-export-${user.id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.json"`
        } 
      }
    );

  } catch (error) {
    console.error('[export-user-data] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
