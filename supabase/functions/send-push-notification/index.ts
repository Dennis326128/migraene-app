import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema for push notification
const PushNotificationSchema = z.object({
  title: z.string()
    .min(1, 'Titel darf nicht leer sein')
    .max(100, 'Titel darf maximal 100 Zeichen lang sein'),
  body: z.string()
    .min(1, 'Nachricht darf nicht leer sein')
    .max(500, 'Nachricht darf maximal 500 Zeichen lang sein'),
  icon: z.string().url().optional(),
  badge: z.string().url().optional(),
  tag: z.string().optional(),
  data: z.record(z.any()).optional()
});

// Generic error handler to prevent exposing internal structures
function handleError(error: unknown, context: string): Response {
  // Log detailed error internally
  console.error(`❌ [${context}] Error:`, error);
  if (error instanceof Error) {
    console.error('Stack trace:', error.stack);
  }

  // Determine error type and return generic message
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({ 
      error: 'Ungültige Notification-Daten'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Check for authentication errors
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
  if (errorMessage.includes('authorization') || errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
    return new Response(JSON.stringify({ 
      error: 'Authentifizierung fehlgeschlagen'
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Generic server error
  return new Response(JSON.stringify({ 
    error: 'Fehler beim Senden der Push-Benachrichtigung'
  }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
}

async function sendPushNotification(
  subscription: PushSubscription,
  payload: NotificationPayload
): Promise<boolean> {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID keys not configured');
  }

  // Import web-push functionality
  const webpush = await import('npm:web-push@3.6.7');
  
  webpush.setVapidDetails(
    'mailto:support@migraene-app.de',
    vapidPublicKey,
    vapidPrivateKey
  );

  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload)
    );

    console.log('Push notification sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    
    // If subscription is no longer valid, we should handle it
    if (error.statusCode === 410) {
      console.log('Subscription expired or invalid');
      return false;
    }
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Extract userId from JWT token instead of trusting request body
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id; // Use authenticated user's ID, not request body
    
    // Validate request body
    let payload: z.infer<typeof PushNotificationSchema>;
    try {
      const rawBody = await req.json();
      payload = PushNotificationSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('❌ Validation error:', error.errors);
        return new Response(JSON.stringify({ 
          error: 'Ungültige Notification-Daten',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { title, body, icon, badge, tag, data } = payload;

    // Get all push subscriptions for this user
    const { data: subscriptions, error: fetchError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (fetchError) {
      console.error('Error fetching subscriptions:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found for user:', userId);
      return new Response(
        JSON.stringify({ message: 'No subscriptions found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send notification to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const success = await sendPushNotification(
          {
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
          { title, body, icon, badge, tag, data }
        );

        // If subscription is invalid, delete it
        if (!success) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }

        return success;
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled' && r.value).length;

    console.log(`Sent ${successful}/${subscriptions.length} notifications`);

    return new Response(
      JSON.stringify({ 
        message: 'Push notifications sent',
        sent: successful,
        total: subscriptions.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleError(error, 'send-push-notification');
  }
});
