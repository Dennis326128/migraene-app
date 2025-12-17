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
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate it's the demo user email
    if (!email.endsWith('@example.com')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Only demo users with @example.com emails allowed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('[create-demo-user] Error listing users:', listError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check existing users' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const existingUser = existingUsers?.users?.find(u => u.email === email);

    if (existingUser) {
      console.log('[create-demo-user] Demo user already exists:', existingUser.id);
      return new Response(
        JSON.stringify({ 
          success: true, 
          userId: existingUser.id,
          message: 'Demo user already exists' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new user with confirmed email
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        is_demo_user: true,
        created_by: 'demo-seed',
      },
    });

    if (createError) {
      console.error('[create-demo-user] Error creating user:', createError);
      return new Response(
        JSON.stringify({ success: false, error: createError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[create-demo-user] Created demo user:', newUser.user?.id);

    // Create user_profiles entry
    if (newUser.user) {
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          user_id: newUser.user.id,
          ai_enabled: true,
          voice_notes_enabled: true,
          tutorial_completed: true,
          quick_entry_mode: true,
        }, { onConflict: 'user_id' });

      if (profileError) {
        console.warn('[create-demo-user] Warning: Could not create profile:', profileError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: newUser.user?.id,
        message: 'Demo user created successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[create-demo-user] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
