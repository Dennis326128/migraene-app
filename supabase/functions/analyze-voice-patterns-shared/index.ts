/**
 * Edge Function: analyze-voice-patterns-shared
 *
 * Doctor-share variant of analyze-voice-patterns.
 * Auth: HMAC-signed `x-doctor-access` token (NO JWT, NO auth.uid).
 *
 * Flow:
 *   1. Verify doctor access token + DB share status (revoke/expiry)
 *   2. Resolve owner user_id from validated share payload
 *   3. Verify owner has ai_processing_consent (has_ai_consent RPC)
 *   4. Verify share has include_ai_analysis enabled
 *   5. Resolve range from share.default_range
 *   6. Build dataset (service role, owner-scoped)
 *   7. Run shared LLM core
 *   8. Persist as ai_reports (owner_id) so the next read-only fetch shows it
 *   9. Return analysis JSON
 *
 * Security:
 *   - Owner user_id NEVER read from the request body
 *   - Service role only used after access verification
 *   - No PHI/health data, transcripts, or notes in logs
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { verifyDoctorAccess } from "../_shared/doctorAccessGuard.ts";
import { buildServerAnalysisDataset } from "../_shared/serverAnalysisDataset.ts";
import { runAnalysisLLM } from "../_shared/analysisCore.ts";
import { checkPatternAnalysisQuota, commitPatternAnalysisUsage, quotaErrorBody } from "../_shared/aiQuotaGate.ts";
import { computeDataStateSignature } from "../_shared/doctorShareSsot.ts";
import { evaluateShareAnalysisGate } from "../_shared/shareAnalysisGate.ts";

const PRESET_DAYS: Record<string, number> = {
  '1m': 30, '30d': 30, '3m': 90, '6m': 180, '12m': 365,
};

function rangeToDates(range: string): { from: string; to: string } {
  const days = PRESET_DAYS[range] ?? 90;
  const now = new Date();
  const berlin = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  berlin.setDate(berlin.getDate() - 1); // yesterday (App SSOT)
  const to = berlin.toISOString().slice(0, 10);
  const fromD = new Date(berlin);
  fromD.setDate(fromD.getDate() - (days - 1));
  const from = fromD.toISOString().slice(0, 10);
  return { from, to };
}

function shortId(id: string | undefined | null): string {
  return id ? `${id.slice(0, 8)}…` : '<none>';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handlePreflight(req);
  const corsHeaders = getCorsHeaders(req);

  const json = (body: Record<string, unknown>, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Verify doctor access (HMAC + DB)
    const access = await verifyDoctorAccess(req, supabase);
    if (!access.valid) {
      const reasonMap: Record<string, { code: string; status: number; msg: string }> = {
        no_token:        { code: 'INVALID_SHARE_SESSION', status: 401, msg: 'Kein Zugriffstoken übermittelt.' },
        invalid_token:   { code: 'INVALID_SHARE_SESSION', status: 401, msg: 'Ungültiges Zugriffstoken.' },
        share_not_found: { code: 'INVALID_SHARE_CODE',    status: 403, msg: 'Freigabe nicht gefunden.' },
        user_mismatch:   { code: 'INVALID_SHARE_SESSION', status: 403, msg: 'Token gehört nicht zur Freigabe.' },
        share_revoked:   { code: 'SHARE_EXPIRED',         status: 403, msg: 'Die Freigabe wurde widerrufen.' },
        share_inactive:  { code: 'SHARE_EXPIRED',         status: 403, msg: 'Die Freigabe ist abgelaufen oder inaktiv.' },
      };
      const r = reasonMap[access.reason ?? ''] ?? { code: 'INVALID_SHARE_SESSION', status: 401, msg: 'Zugriff verweigert.' };
      console.log(`[shared-ai] access_denied reason=${access.reason ?? 'unknown'}`);
      return json({ error: r.msg, code: r.code }, r.status);
    }

    const ownerUserId = access.payload!.user_id;
    const shareId = access.payload!.share_id;
    console.log(`[shared-ai] start owner=${shortId(ownerUserId)} share=${shortId(shareId)}`);

    // 2. Owner consent gate (DSGVO Art. 9) — non-bypassable
    const { data: consentOk, error: consentErr } = await supabase.rpc('has_ai_consent', { p_user_id: ownerUserId });
    if (consentErr) {
      console.error(`[shared-ai] consent_rpc_error owner=${shortId(ownerUserId)}:`, consentErr);
      return json({ error: 'Einwilligungsprüfung fehlgeschlagen.', code: 'CONSENT_CHECK_FAILED' }, 500);
    }
    if (consentOk !== true) {
      console.log(`[shared-ai] AI_CONSENT_REQUIRED owner=${shortId(ownerUserId)}`);
      return json(
        { error: 'Der Patient hat die KI-Verarbeitung nicht freigegeben.', code: 'AI_CONSENT_REQUIRED' },
        403,
      );
    }

    // 3. Unified Share-Analyse-Gate (include_ai_analysis + allow_ai_generate
    //    + share active/expiry + 15-Min-Cooldown). Replaces the previous
    //    inline include/allow checks so that the rule lives in ONE place
    //    (`_shared/shareAnalysisGate.ts`).
    const [{ data: shareSettings }, { data: shareRow }, { data: lastReportRow }] = await Promise.all([
      supabase.from('doctor_share_settings').select('include_ai_analysis,allow_ai_generate,range_preset').eq('share_id', shareId).maybeSingle(),
      supabase.from('doctor_shares').select('default_range,is_active,expires_at,revoked_at').eq('id', shareId).maybeSingle(),
      supabase.from('ai_reports')
        .select('created_at')
        .eq('user_id', ownerUserId)
        .eq('report_type', 'pattern_analysis')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const gate = evaluateShareAnalysisGate({
      share: {
        active: shareRow ? (shareRow.is_active !== false && !shareRow.revoked_at) : false,
        expiresAtISO: shareRow?.expires_at ?? null,
      },
      settings: {
        include_ai_analysis: shareSettings?.include_ai_analysis ?? false,
        allow_ai_generate: shareSettings?.allow_ai_generate ?? false,
      },
      lastAnalysisAtISO: lastReportRow?.created_at ?? null,
    });

    if (!gate.allowed) {
      const gateMap: Record<string, { code: string; status: number; msg: string }> = {
        share_inactive:            { code: 'SHARE_INACTIVE',            status: 403, msg: 'Die Freigabe ist nicht aktiv.' },
        share_expired:             { code: 'SHARE_EXPIRED',             status: 403, msg: 'Die Freigabe ist abgelaufen.' },
        ai_analysis_not_included:  { code: 'AI_ANALYSIS_NOT_INCLUDED',  status: 403, msg: 'KI-Analyse ist für diese Freigabe nicht aktiviert.' },
        ai_generation_not_allowed: { code: 'AI_GENERATE_NOT_ALLOWED',   status: 403, msg: 'Diese Freigabe erlaubt keine neuen KI-Analysen über die Website.' },
        cooldown_active:           { code: 'ANALYSIS_COOLDOWN_ACTIVE',  status: 429, msg: 'Eine Analyse wurde gerade erstellt. Bitte später erneut versuchen.' },
      };
      const r = gateMap[gate.reason] ?? { code: 'AI_GENERATE_NOT_ALLOWED', status: 403, msg: 'Analyse aktuell nicht möglich.' };
      console.log(`[shared-ai] gate_blocked reason=${gate.reason} owner=${shortId(ownerUserId)} share=${shortId(shareId)}`);
      const body: Record<string, unknown> = { error: r.msg, code: r.code };
      if (gate.reason === 'cooldown_active' && gate.waitMinutes) body.waitMinutes = gate.waitMinutes;
      return json(body, r.status);
    }

    // 4. Owner profile gate (App-side AI disable)
    const { data: profile } = await supabase.from('user_profiles').select('ai_enabled').eq('user_id', ownerUserId).maybeSingle();
    if (profile && profile.ai_enabled === false) {
      return json({ error: 'Die KI-Analyse ist im Account des Patienten deaktiviert.', code: 'AI_NOT_ENABLED_FOR_OWNER' }, 403);
    }

    // 5. Range
    const range = shareSettings?.range_preset ?? shareRow?.default_range ?? '3m';
    const { from, to } = rangeToDates(range);

    // 5b. Quota check on PATIENT account (no cooldown for Doctor-Share)
    const quotaCheck = await checkPatternAnalysisQuota(supabase, ownerUserId, { enforceCooldown: false });
    if (!quotaCheck.allowed) {
      console.log(`[shared-ai] quota_blocked owner=${shortId(ownerUserId)} reason=${quotaCheck.blockedReason}`);
      return json(quotaErrorBody(quotaCheck), quotaCheck.status ?? 429);
    }

    // 6. Build dataset
    const dataset = await buildServerAnalysisDataset(supabase, ownerUserId, from, to);
    console.log(`[shared-ai] dataset owner=${shortId(ownerUserId)} range=${range} days=${dataset.meta.totalDays} voice=${dataset.meta.voiceEventCount} pain=${dataset.meta.painEntryCount}`);

    // 7. LLM core
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      console.error('[shared-ai] LOVABLE_API_KEY missing');
      return json({ error: 'Server nicht konfiguriert.' }, 500);
    }

    const llm = await runAnalysisLLM({
      serializedContext: dataset.serialized,
      meta: dataset.meta,
      fromDate: from,
      toDate: to,
      apiKey,
      includesPrivateNotes: false, // Doctor-Share: NEVER include private free-text notes
    });

    if (!llm.ok) {
      console.log(`[shared-ai] llm_unavailable owner=${shortId(ownerUserId)} status=${llm.status}`);
      return json(llm.body, llm.status);
    }
    // 7b. Commit quota (success only — bills against patient account)
    await commitPatternAnalysisUsage(supabase, ownerUserId, quotaCheck.snapshot);


    try {
      const dedupeKey = `pattern_analysis_${from}_${to}`;
      const ds = await computeDataStateSignature(supabase, ownerUserId, from, to);
      await supabase.from('ai_reports')
        .delete()
        .eq('user_id', ownerUserId)
        .eq('report_type', 'pattern_analysis')
        .eq('dedupe_key', dedupeKey);
      await supabase.from('ai_reports').insert({
        user_id: ownerUserId,
        report_type: 'pattern_analysis',
        source: 'doctor_share',
        title: 'Musteranalyse (auf Anfrage durch Arzt-Freigabe)',
        from_date: from,
        to_date: to,
        dedupe_key: dedupeKey,
        response_json: llm.body,
        model: 'google/gemini-2.5-flash',
        data_state_signature: ds.signature,
        source_updated_at: ds.latestRelevantDataAt,
      });
    } catch (persistErr) {
      console.error(`[shared-ai] persist_failed owner=${shortId(ownerUserId)}:`, persistErr);
      // non-fatal — still return the analysis to the doctor
    }

    // 9. Mark snapshot stale so next GET rebuilds with the new analysis
    try {
      await supabase.from('doctor_share_report_snapshots')
        .update({ is_stale: true })
        .eq('share_id', shareId);
    } catch { /* non-fatal */ }

    console.log(`[shared-ai] success owner=${shortId(ownerUserId)} share=${shortId(shareId)} range=${range}`);
    return json(llm.body, 200);

  } catch (err) {
    console.error('[shared-ai] unhandled_error:', err);
    return json({ error: 'Interner Fehler.' }, 500);
  }
});
