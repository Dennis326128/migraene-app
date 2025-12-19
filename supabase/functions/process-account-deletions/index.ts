import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET')!;

    // Verify cron secret from header or body
    const authHeader = req.headers.get('authorization');
    let isAuthorized = false;
    
    try {
      const body = await req.json();
      if (body.cron_secret === cronSecret) {
        isAuthorized = true;
      }
    } catch {
      // No body or invalid JSON - check header
    }

    if (!isAuthorized && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[process-account-deletions] Unauthorized request');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[process-account-deletions] Starting scheduled deletion check...');

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Find all users whose deletion is due
    const { data: usersToDelete, error: fetchError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, deletion_scheduled_for')
      .eq('account_status', 'deletion_requested')
      .lte('deletion_scheduled_for', new Date().toISOString());

    if (fetchError) {
      console.error('[process-account-deletions] Error fetching users:', fetchError);
      throw fetchError;
    }

    console.log(`[process-account-deletions] Found ${usersToDelete?.length || 0} users to delete`);

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    if (usersToDelete && usersToDelete.length > 0) {
      for (const user of usersToDelete) {
        results.processed++;
        
        try {
          console.log(`[process-account-deletions] Deleting user: ${user.user_id}`);
          
          // Call the hard delete function
          const response = await fetch(`${supabaseUrl}/functions/v1/delete-user-hard`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: user.user_id,
              cron_secret: cronSecret
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Delete failed: ${errorText}`);
          }

          results.success++;
          console.log(`[process-account-deletions] Successfully deleted user: ${user.user_id}`);
          
        } catch (error) {
          results.failed++;
          const errorMsg = `Failed to delete ${user.user_id}: ${error.message}`;
          results.errors.push(errorMsg);
          console.error(`[process-account-deletions] ${errorMsg}`);
        }
      }
    }

    console.log(`[process-account-deletions] Completed. Success: ${results.success}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[process-account-deletions] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
