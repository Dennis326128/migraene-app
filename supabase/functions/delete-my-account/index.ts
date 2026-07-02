import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ error: 'missing_authorization' }, 401);
    }

    // Verify user from JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return json({ error: 'invalid_session' }, 401);
    }
    const user = userRes.user;

    // Optional password reverification
    let body: { confirmation?: string; password?: string } = {};
    try { body = await req.json(); } catch { /* ignore */ }

    if (body.confirmation !== 'LÖSCHEN') {
      return json({ error: 'confirmation_required' }, 400);
    }

    if (body.password && user.email) {
      const verifyClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: pwErr } = await verifyClient.auth.signInWithPassword({
        email: user.email,
        password: body.password,
      });
      if (pwErr) {
        return json({ error: 'invalid_password' }, 401);
      }
    }

    console.log(`[delete-my-account] Deleting data for user ${user.id}`);

    // Delete all user data via existing RPC (uses auth.uid())
    const { error: rpcErr } = await userClient.rpc('delete_user_account');
    if (rpcErr) {
      console.error('[delete-my-account] delete_user_account failed:', rpcErr.message);
      return json({ error: 'data_deletion_failed', detail: rpcErr.message }, 500);
    }

    // Delete storage objects (generated-reports bucket, user-scoped path)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    try {
      const { data: files } = await admin.storage
        .from('generated-reports')
        .list(user.id, { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map(f => `${user.id}/${f.name}`);
        await admin.storage.from('generated-reports').remove(paths);
      }
    } catch (e) {
      console.error('[delete-my-account] storage cleanup warning:', (e as Error).message);
    }

    // Delete auth user
    const { error: authDelErr } = await admin.auth.admin.deleteUser(user.id);
    if (authDelErr) {
      console.error('[delete-my-account] auth deletion failed:', authDelErr.message);
      return json({ error: 'auth_deletion_failed', detail: authDelErr.message }, 500);
    }

    console.log(`[delete-my-account] Successfully deleted user ${user.id}`);
    return json({ success: true });
  } catch (e) {
    console.error('[delete-my-account] Unexpected error:', (e as Error).message);
    return json({ error: 'internal_error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
