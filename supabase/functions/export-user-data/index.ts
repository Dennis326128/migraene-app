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

    // Collect all user data from relevant tables
    const exportData: Record<string, any> = {
      export_info: {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        email: user.email,
        format: 'DSGVO Art. 20 - Recht auf Datenübertragbarkeit',
      },
      tables: {}
    };

    // Tables to export (in order)
    const tablesToExport = [
      { name: 'user_profiles', select: '*' },
      { name: 'user_consents', select: '*' },
      { name: 'patient_data', select: '*' },
      { name: 'doctors', select: '*' },
      { name: 'pain_entries', select: '*' },
      { name: 'voice_notes', select: '*, voice_note_segments(*)' },
      { name: 'user_medications', select: '*' },
      { name: 'medication_courses', select: '*' },
      { name: 'medication_effects', select: '*' },
      { name: 'user_medication_limits', select: '*' },
      { name: 'reminders', select: '*' },
      { name: 'weather_logs', select: '*' },
      { name: 'user_report_settings', select: '*' },
      { name: 'user_feedback', select: '*' },
    ];

    for (const table of tablesToExport) {
      try {
        const { data, error } = await supabase
          .from(table.name)
          .select(table.select)
          .eq('user_id', user.id);

        if (error) {
          console.warn(`[export-user-data] Error fetching ${table.name}:`, error.message);
          exportData.tables[table.name] = { error: error.message, count: 0 };
        } else {
          exportData.tables[table.name] = {
            count: data?.length || 0,
            data: data || []
          };
        }
      } catch (err) {
        console.warn(`[export-user-data] Exception fetching ${table.name}:`, err);
        exportData.tables[table.name] = { error: String(err), count: 0 };
      }
    }

    // Also fetch entry_symptoms via pain_entries
    try {
      const { data: entries } = await supabase
        .from('pain_entries')
        .select('id')
        .eq('user_id', user.id);

      if (entries && entries.length > 0) {
        const entryIds = entries.map(e => e.id);
        const { data: symptoms, error: symptomsError } = await supabase
          .from('entry_symptoms')
          .select('*')
          .in('entry_id', entryIds);

        if (symptomsError) {
          exportData.tables['entry_symptoms'] = { error: symptomsError.message, count: 0 };
        } else {
          exportData.tables['entry_symptoms'] = {
            count: symptoms?.length || 0,
            data: symptoms || []
          };
        }
      }
    } catch (err) {
      console.warn('[export-user-data] Error fetching entry_symptoms:', err);
    }

    // Calculate totals
    let totalRecords = 0;
    for (const table of Object.values(exportData.tables)) {
      if (typeof table === 'object' && 'count' in table) {
        totalRecords += table.count;
      }
    }
    exportData.export_info.total_records = totalRecords;

    console.log(`[export-user-data] Export complete. Total records: ${totalRecords}`);

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
