import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting reminder processor...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Fetch reminders that are due (within next 5 minutes to account for cron intervals)
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    const { data: reminders, error: fetchError } = await supabase
      .from('reminders')
      .select('*')
      .eq('status', 'pending')
      .eq('notification_enabled', true)
      .gte('date_time', now.toISOString())
      .lte('date_time', fiveMinutesFromNow.toISOString())
      .limit(50);

    if (fetchError) {
      console.error('Error fetching reminders:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${reminders?.length || 0} pending reminders`);

    let processed = 0;
    let failed = 0;

    // Process each reminder
    if (reminders && reminders.length > 0) {
      for (const reminder of reminders) {
        try {
          // Send push notification
          const notificationResponse = await fetch(
            `${supabaseUrl}/functions/v1/send-push-notification`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                userId: reminder.user_id,
                title: 'Erinnerung',
                body: reminder.type === 'medication' 
                  ? `Zeit für dein Medikament: ${reminder.title}`
                  : `Termin: ${reminder.title}`,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: reminder.id,
                data: {
                  reminderId: reminder.id,
                  type: reminder.type,
                  url: `/reminders?id=${reminder.id}`,
                },
              }),
            }
          );

          if (notificationResponse.ok) {
            // Update reminder status to 'completed'
            const { error: updateError } = await supabase
              .from('reminders')
              .update({ 
                status: 'completed',
                updated_at: new Date().toISOString()
              })
              .eq('id', reminder.id);

            if (updateError) {
              console.error(`Failed to update reminder ${reminder.id}:`, updateError);
              failed++;
            } else {
              processed++;
              console.log(`Successfully processed reminder ${reminder.id}`);
            }
          } else {
            console.error(`Failed to send notification for reminder ${reminder.id}`);
            failed++;
          }
        } catch (error) {
          console.error(`Error processing reminder ${reminder.id}:`, error);
          failed++;
        }
      }
    }

    // Clean up old completed reminders (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: cleanupError } = await supabase
      .from('reminders')
      .delete()
      .eq('status', 'completed')
      .lt('updated_at', sevenDaysAgo);

    if (cleanupError) {
      console.error('Error cleaning up old reminders:', cleanupError);
    }

    const result = {
      success: true,
      processed,
      failed,
      total: reminders?.length || 0,
      timestamp: new Date().toISOString()
    };

    console.log('Reminder processor completed:', result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in reminder processor:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});