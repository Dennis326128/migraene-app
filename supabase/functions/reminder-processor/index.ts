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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log('🔄 Processing medication effect reminders...');

    // Get all pending reminders that are due  
    const { data: pendingReminders, error: fetchError } = await supabaseClient
      .from('reminder_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50);

    if (fetchError) {
      console.error('❌ Error fetching reminders:', fetchError);
      throw fetchError;
    }

    if (!pendingReminders || pendingReminders.length === 0) {
      console.log('✅ No pending reminders found');
      return new Response(
        JSON.stringify({ message: 'No pending reminders', processed: 0 }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    console.log(`📋 Found ${pendingReminders.length} pending reminders`);

    let processed = 0;
    let failed = 0;

    // Process each reminder
    for (const reminder of pendingReminders) {
      try {
        console.log(`📲 Processing reminder ID: ${reminder.id} for event_med_id: ${reminder.event_med_id}`);

        // Update reminder status to 'sent'
        const { error: updateError } = await supabaseClient
          .from('reminder_queue')
          .update({ 
            status: 'sent',
            updated_at: new Date().toISOString()
          })
          .eq('id', reminder.id);

        if (updateError) {
          console.error(`❌ Failed to update reminder ${reminder.id}:`, updateError);
          
          // Increment retry count for failed reminders
          await supabaseClient
            .from('reminder_queue')
            .update({ 
              retry_count: reminder.retry_count + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', reminder.id);
          
          failed++;
        } else {
          console.log(`✅ Reminder ${reminder.id} marked as sent`);
          processed++;
        }

      } catch (error) {
        console.error(`❌ Error processing reminder ${reminder.id}:`, error);
        failed++;
      }
    }

    // Clean up old completed/cancelled reminders (older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { error: cleanupError } = await supabaseClient
      .from('reminder_queue')
      .delete()
      .in('status', ['completed', 'cancelled'])
      .lt('created_at', sevenDaysAgo.toISOString());

    if (cleanupError) {
      console.warn('⚠️ Error during cleanup:', cleanupError);
    } else {
      console.log('🧹 Cleaned up old reminders');
    }

    const result = {
      message: 'Reminder processing completed',
      processed,
      failed,
      total: pendingReminders.length
    };

    console.log(`📊 Processing summary:`, result);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Reminder processor error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});