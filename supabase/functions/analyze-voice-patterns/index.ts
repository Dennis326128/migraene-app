import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { requireAiConsent } from '../_shared/aiConsentGate.ts';
import { checkPatternAnalysisQuota, commitPatternAnalysisUsage, quotaErrorBody } from '../_shared/aiQuotaGate.ts';
import { runPatternAnalysisV22 } from '../_shared/patternAnalysisBuilder.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Request schema unchanged — App client still passes preAnalysis + deterministicFindings.
const RequestSchema = z.object({
  serializedContext: z.string().min(10),
  meta: z.object({
    totalDays: z.number(),
    voiceEventCount: z.number(),
    painEntryCount: z.number(),
    medicationIntakeCount: z.number(),
    daysWithPain: z.number(),
    daysWithMecfs: z.number(),
  }),
  fromDate: z.string(),
  toDate: z.string(),
  preAnalysis: z.any().optional(),
  deterministicFindings: z.array(z.any()).optional(),
});

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Nicht authentifiziert' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Authentifizierung fehlgeschlagen' }, 401);

    // AI consent (DSGVO Art. 9)
    const consentBlock = await requireAiConsent(supabase, user.id, corsHeaders);
    if (consentBlock) return consentBlock;

    // Quota + cooldown (service role)
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const quotaCheck = await checkPatternAnalysisQuota(supabaseAdmin, user.id, { enforceCooldown: true });
    if (!quotaCheck.allowed) {
      console.log(`[analyze-voice-patterns] blocked reason=${quotaCheck.blockedReason} user=${user.id.slice(0, 8)}…`);
      return jsonResponse(quotaErrorBody(quotaCheck), quotaCheck.status ?? 429);
    }

    // Parse body
    let body: unknown;
    try { body = await req.json(); } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: 'Ungültige Anfrage', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const { serializedContext, meta, fromDate, toDate, preAnalysis, deterministicFindings } = parsed.data;

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY nicht konfiguriert');

    // === Shared engine ===
    const result = await runPatternAnalysisV22({
      serializedContext, meta, fromDate, toDate,
      preAnalysis, deterministicFindings,
      apiKey,
      source: 'app',
      includePrivateNotes: true, // App context may include user's own private notes
    });

    if (!result.ok) {
      return jsonResponse(result.body, result.status);
    }

    // Commit quota only on success
    await commitPatternAnalysisUsage(supabaseAdmin, user.id, quotaCheck.snapshot);

    const r = result.body as Record<string, any>;
    const len = (k: string) => Array.isArray(r[k]) ? r[k].length : 0;
    console.log(`[analyze-voice-patterns] Success: ${meta.totalDays}d, ~${result.tokenEstimate}tok, counts: pp=${len('possiblePatterns')} pcf=${len('painContextFindings')} fcf=${len('fatigueContextFindings')} mcf=${len('medicationContextFindings')} rs=${len('recurringSequences')} oq=${len('openQuestions')} cn=${len('confidenceNotes')} lef=${len('llm_expanded_findings')}, quota=${quotaCheck.snapshot.currentUsage + 1}/${quotaCheck.quota.limit}`);

    return jsonResponse(result.body, 200);

  } catch (error) {
    console.error('[analyze-voice-patterns] Unhandled error:', error);
    const msg = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return jsonResponse({ error: msg }, 500);
  }
});
