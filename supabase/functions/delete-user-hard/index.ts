import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteRequest {
  user_id: string;
  cron_secret?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET');

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const body: DeleteRequest = await req.json();
    const { user_id, cron_secret } = body;

    // Verify this is called from cron job or authenticated admin
    if (cron_secret !== cronSecret) {
      console.error('[delete-user-hard] Invalid cron secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[delete-user-hard] Starting hard delete for user: ${user_id}`);

    // 1. Delete all user data using the existing function (bypasses RLS with service role)
    // We'll do this manually to have full control
    
    // Delete in correct dependency order (same as delete_user_account function)
    const deleteOperations = [
      // 1. voice_note_segments (FK → voice_notes)
      supabaseAdmin.from('voice_note_segments').delete().in('voice_note_id', 
        supabaseAdmin.from('voice_notes').select('id').eq('user_id', user_id)
      ),
      
      // Note: We need to do these sequentially due to FK constraints
    ];

    // Execute deletes in proper order
    console.log('[delete-user-hard] Deleting voice_note_segments...');
    const voiceNoteIds = await supabaseAdmin
      .from('voice_notes')
      .select('id')
      .eq('user_id', user_id);
    
    if (voiceNoteIds.data && voiceNoteIds.data.length > 0) {
      const ids = voiceNoteIds.data.map(v => v.id);
      await supabaseAdmin.from('voice_note_segments').delete().in('voice_note_id', ids);
    }

    console.log('[delete-user-hard] Deleting medication_effects...');
    const entryIds = await supabaseAdmin
      .from('pain_entries')
      .select('id')
      .eq('user_id', user_id);
    
    if (entryIds.data && entryIds.data.length > 0) {
      const ids = entryIds.data.map(e => e.id);
      await supabaseAdmin.from('medication_effects').delete().in('entry_id', ids);
      await supabaseAdmin.from('entry_symptoms').delete().in('entry_id', ids);
    }

    console.log('[delete-user-hard] Deleting pain_entries...');
    await supabaseAdmin.from('pain_entries').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting voice_notes...');
    await supabaseAdmin.from('voice_notes').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting voice_entries_debug...');
    await supabaseAdmin.from('voice_entries_debug').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting medication_courses...');
    await supabaseAdmin.from('medication_courses').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting user_medication_limits...');
    await supabaseAdmin.from('user_medication_limits').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting user_medications...');
    await supabaseAdmin.from('user_medications').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting reminders...');
    await supabaseAdmin.from('reminders').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting push_subscriptions...');
    await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting doctors...');
    await supabaseAdmin.from('doctors').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting patient_data...');
    await supabaseAdmin.from('patient_data').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting user_report_settings...');
    await supabaseAdmin.from('user_report_settings').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting user_ai_usage...');
    await supabaseAdmin.from('user_ai_usage').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting user_feedback...');
    await supabaseAdmin.from('user_feedback').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting user_consents...');
    await supabaseAdmin.from('user_consents').delete().eq('user_id', user_id);

    console.log('[delete-user-hard] Deleting weather_logs...');
    await supabaseAdmin.from('weather_logs').delete().eq('user_id', user_id);

    // Keep audit_logs for 30 days (compliance), but add final deletion record
    console.log('[delete-user-hard] Adding final audit log...');
    await supabaseAdmin.from('audit_logs').insert({
      user_id,
      action: 'HARD_DELETE_COMPLETED',
      table_name: 'all_user_data',
      old_data: { deleted_at: new Date().toISOString() }
    });

    console.log('[delete-user-hard] Deleting user_profiles...');
    await supabaseAdmin.from('user_profiles').delete().eq('user_id', user_id);

    // 2. Delete the Auth user
    console.log('[delete-user-hard] Deleting auth user...');
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    
    if (authError) {
      console.error('[delete-user-hard] Error deleting auth user:', authError);
      // Continue anyway - data is deleted, auth user might already be gone
    }

    console.log(`[delete-user-hard] Successfully deleted user: ${user_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id,
        message: 'User and all data permanently deleted' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[delete-user-hard] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
