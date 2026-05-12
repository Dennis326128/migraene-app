## Ziel
Website (Doctor-Share) zeigt gespeicherte App-Analysen aus `ai_reports` (SSOT) und darf nur mit explizitem Patientenrecht eine neue Analyse erstellen.

## A) DB-Migration (neu)

`doctor_share_settings`:
- `allow_ai_generate boolean NOT NULL DEFAULT false` — Website darf neue Analyse triggern.
- `share_day_factors boolean NOT NULL DEFAULT false` — Strukturierte Tagesfaktoren ausliefern.

Bestehend bleibt: `include_ai_analysis` (= gespeicherte Analyse anzeigen).

Keine Defaults für bestehende Codes ändern → automatisch `false` (sicher).

## B) Neuer Shared-Helper

`supabase/functions/_shared/doctorShareSsot.ts`:
- `loadLatestPatternAnalysis(supabase, userId, from, to)` → liest neuesten Eintrag aus `ai_reports` (`report_type='pattern_analysis'`, Zeitraum ⊆ from/to oder `from_date<=from && to_date>=to` bevorzugt; sonst neuester überlappender), erzeugt `summaryMd` aus `response_json` (Markdown-Builder: top-Insights, Korrelationen, Empfehlungen, plus `validation`).
- `computeDataStateSignature(supabase, userId, from, to, opts)` → SHA-256 Hash über: max(updated_at) von `pain_entries`, `medication_intakes`, `weather_logs`, `voice_notes(context_type='tageszustand')`, `voice_events`. Liefert `{signature, latestRelevantDataAt}`.
- `loadDayFactors(supabase, userId, from, to)` → strukturierte Tagesfaktoren mit `{daily, aggregates}`. Whitelist: `mood, stress, sleep, sleepQuality, energy, fatigueContextTags, triggers (nur Tags), hadSpecialEvent`. Niemals `metadata.notes`, Transkripte, Audio-URLs, „Was war heute besonders?"-Freitext.
- `buildSharePayload(supabase, shareId, userId, settings)` → liefert `share`, `quotaState`, `latestAiReport`, `latestRelevantDataAt`, `dataStateSignature`, `isStale`, optional `dayFactors`.

`isStale = !latestAiReport || latestAiReport.dataStateSignature !== current || latestAiReport älter als 14 Tage`.

## C) `get-shared-report-data/index.ts`

- Liest zusätzlich `allow_ai_generate, share_day_factors, include_ai_analysis, include_context_notes` aus `doctor_share_settings`.
- Resolved aiConsentState (`granted|missing|revoked`) via `user_consents` (neueste, `consent_withdrawn_at` → revoked).
- Resolved aiEnabledState aus `user_profiles.ai_enabled`/global Flag.
- Quota nur lesend via `checkPatternAnalysisQuota(..., {enforceCooldown:false})` → verbraucht nichts.
- Response wird ergänzt um Felder: `share`, `quotaState`, `latestAiReport`, `latestRelevantDataAt`, `dataStateSignature`, `isStale`, `dayFactors?`.
- Falls `include_ai_analysis=false` → `latestAiReport=null`.
- Falls `share_day_factors=false` → kein `dayFactors`-Feld.

## D) `analyze-voice-patterns-shared/index.ts`

Reihenfolge der Gates (vor LLM):
1. Doctor access ✓ (vorhanden)
2. Patient consent (`has_ai_consent`) → `AI_CONSENT_REQUIRED` (vorhanden)
3. `include_ai_analysis=true` → `AI_NOT_ENABLED_FOR_SHARE` (vorhanden)
4. **NEU**: `allow_ai_generate=true` → sonst `AI_GENERATE_NOT_ALLOWED` (403)
5. `ai_enabled` (vorhanden)
6. Quota (vorhanden, ohne Cooldown)

Persistierung: bestehender Insert nach `ai_reports` setzt jetzt zusätzlich `data_state_signature` + `source_updated_at` aus `computeDataStateSignature`.

## E) Tests

`supabase/functions/_shared/doctorShareSsot_test.ts` (Deno):
- summaryMd-Builder erzeugt Markdown aus typischem `response_json`.
- isStale-Logik: signatur-Mismatch / >14d / null.
- Tagesfaktoren-Whitelist filtert Freitexte raus (negative test: `metadata.notes`, Transkript-Strings nie im JSON).
- `computeDataStateSignature` deterministisch + ändert sich bei updated_at-Wechsel.

`supabase/functions/analyze-voice-patterns-shared/gates_test.ts`:
- `AI_GENERATE_NOT_ALLOWED` wenn `allow_ai_generate=false`.
- erfolgreiche Pfad-Validierung mit allen Gates true (mit Mock-Supabase).

Bestehender App-Pfad (`analyze-voice-patterns`) bleibt unberührt.

## F) Response-Shape (Auszug)

```jsonc
{
  "report": { /* unverändert */ },
  "share": {
    "allowAiGenerate": false,
    "shareDayFactors": false,
    "aiConsentState": "granted",
    "aiEnabledState": "enabled"
  },
  "quotaState": { "remaining": 2, "limit": 3, "resetAtISO": "2026-06-01T00:00:00Z", "isUnlimited": false },
  "latestAiReport": {
    "id": "...", "summaryMd": "## Muster ...",
    "createdAtISO": "...", "periodFromISO": "...", "periodToISO": "...",
    "model": "google/gemini-2.5-flash", "source": "patient",
    "insightsHash": "sha256:...", "validationStatus": "ok"
  },
  "latestRelevantDataAt": "2026-05-12T08:30:00Z",
  "dataStateSignature": "sha256:...",
  "isStale": false,
  "dayFactors": { /* nur wenn share_day_factors=true */ }
}
```

## G) Risiken / Nicht umgesetzt
- `ai_reports` hat kein Markdown-Feld → `summaryMd` wird deterministisch aus `response_json` gebaut. Alternative wäre Migration mit `summary_md`-Spalte (verworfen — kein Wert-Add solange JSON SSOT bleibt).
- `weather_logs` evtl. nicht user-scoped → Signatur ignoriert weather falls Spalte fehlt (try/catch).
- Globaler `ai_enabled`-Killswitch gibt es nicht in DB → Zustand `disabled_globally` wird nur ausgegeben wenn Env-Flag `AI_GLOBAL_DISABLED=true` gesetzt ist.

Bitte bestätigen, dann implementiere ich A–E in einem Rutsch.