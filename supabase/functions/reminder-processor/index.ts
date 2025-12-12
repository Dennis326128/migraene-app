import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[reminder-processor] Starting...');

    // Verify cron secret for scheduled calls
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    
    // Allow both authenticated requests and cron requests
    const authHeader = req.headers.get('authorization');
    if (!authHeader && cronSecret !== expectedSecret) {
      console.error('[reminder-processor] Unauthorized request');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    console.log(`[reminder-processor] Scanning for reminders between ${now.toISOString()} and ${fiveMinutesFromNow.toISOString()}`);

    // STEP 1: Claim pending reminders by setting status to 'processing'
    // This prevents double-sends from parallel cron runs
    const { data: claimedReminders, error: claimError } = await supabase
      .from('reminders')
      .update({ 
        status: 'processing',
        updated_at: now.toISOString()
      })
      .eq('status', 'pending')
      .eq('notification_enabled', true)
      .gte('date_time', now.toISOString())
      .lte('date_time', fiveMinutesFromNow.toISOString())
      .select('*')
      .limit(50);

    if (claimError) {
      console.error('[reminder-processor] Error claiming reminders:', claimError);
      throw claimError;
    }

    console.log(`[reminder-processor] Claimed ${claimedReminders?.length || 0} reminders for processing`);

    let processed = 0;
    let failed = 0;
    let rescheduled = 0;

    // Process each claimed reminder
    if (claimedReminders && claimedReminders.length > 0) {
      for (const reminder of claimedReminders) {
        try {
          console.log(`[reminder-processor] Processing reminder ${reminder.id}: ${reminder.title}`);

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
            // Handle repeat logic
            if (reminder.repeat && reminder.repeat !== 'none') {
              // Calculate next occurrence
              const currentDateTime = new Date(reminder.date_time);
              let nextDateTime: Date;

              switch (reminder.repeat) {
                case 'daily':
                  nextDateTime = new Date(currentDateTime);
                  nextDateTime.setDate(nextDateTime.getDate() + 1);
                  break;
                case 'weekly':
                  nextDateTime = new Date(currentDateTime);
                  nextDateTime.setDate(nextDateTime.getDate() + 7);
                  break;
                case 'monthly':
                  nextDateTime = new Date(currentDateTime);
                  nextDateTime.setMonth(nextDateTime.getMonth() + 1);
                  break;
                default:
                  nextDateTime = currentDateTime;
              }

              // Reschedule: update date_time and set status back to pending
              const { error: rescheduleError } = await supabase
                .from('reminders')
                .update({ 
                  date_time: nextDateTime.toISOString(),
                  status: 'pending',
                  updated_at: new Date().toISOString()
                })
                .eq('id', reminder.id);

              if (rescheduleError) {
                console.error(`[reminder-processor] Failed to reschedule reminder ${reminder.id}:`, rescheduleError);
                failed++;
              } else {
                rescheduled++;
                processed++;
                console.log(`[reminder-processor] Rescheduled reminder ${reminder.id} to ${nextDateTime.toISOString()}`);
              }
            } else {
              // Non-repeating: mark as completed
              const { error: updateError } = await supabase
                .from('reminders')
                .update({ 
                  status: 'completed',
                  updated_at: new Date().toISOString()
                })
                .eq('id', reminder.id);

              if (updateError) {
                console.error(`[reminder-processor] Failed to complete reminder ${reminder.id}:`, updateError);
                failed++;
              } else {
                processed++;
                console.log(`[reminder-processor] Completed reminder ${reminder.id}`);
              }
            }
          } else {
            const errorText = await notificationResponse.text();
            console.error(`[reminder-processor] Failed to send notification for ${reminder.id}:`, errorText);
            
            // Revert status to pending on notification failure
            await supabase
              .from('reminders')
              .update({ 
                status: 'pending',
                updated_at: new Date().toISOString()
              })
              .eq('id', reminder.id);
            
            failed++;
          }
        } catch (error) {
          console.error(`[reminder-processor] Error processing reminder ${reminder.id}:`, error);
          
          // Revert status to pending on error
          await supabase
            .from('reminders')
            .update({ 
              status: 'pending',
              updated_at: new Date().toISOString()
            })
            .eq('id', reminder.id);
          
          failed++;
        }
      }
    }

    // Clean up old completed reminders (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: cleanupError, count: cleanedUp } = await supabase
      .from('reminders')
      .delete()
      .eq('status', 'completed')
      .lt('updated_at', sevenDaysAgo);

    if (cleanupError) {
      console.error('[reminder-processor] Error cleaning up old reminders:', cleanupError);
    } else if (cleanedUp && cleanedUp > 0) {
      console.log(`[reminder-processor] Cleaned up ${cleanedUp} old completed reminders`);
    }

    const result = {
      success: true,
      processed,
      rescheduled,
      failed,
      total: claimedReminders?.length || 0,
      timestamp: new Date().toISOString()
    };

    console.log('[reminder-processor] Completed:', result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('[reminder-processor] Error:', error);
    
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
