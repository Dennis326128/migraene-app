## Ziel
Die KI-Analyse `pattern_analysis` final stabil machen: Free-Limit 3/Monat (Bypass `ai_unlimited`), 5-Min-Cooldown UI-erzwungen, klare Cache-Badges (Aktuell/Veraltet anhand Signature + 14-Tage-TTL), strukturierte Fehlercodes, sauberer Consent-UI-Pfad, Europe/Berlin-Datumsgrenzen.

## 1) DB — keine neue Tabelle
`user_ai_usage` ist bereits passend (`feature='pattern_analysis'`, monatliches `period_start`, `request_count`, `last_used_at`). Genutzt analog zu `analyze-voice-notes`. Keine Migration nötig.

## 2) Edge Function `analyze-voice-patterns` (App)
- **Quota-Check VOR LLM-Call** (per Service-Role lesen): 
  - Skip wenn `user_profiles.ai_unlimited=true`.
  - Sonst: `request_count >= 3` im aktuellen Monat → `409 { code:'QUOTA_EXCEEDED', usageCount, limit:3 }`.
- **Cooldown-Check** (5 Min seit `last_used_at`) → `429 { code:'COOLDOWN_ACTIVE', cooldownRemaining }`. Bypass bei `ai_unlimited`.
- **Quota-Increment NUR nach erfolgreichem + validiertem Result.** (Nicht bei Timeout/Validation-Fail/LLM 5xx/Consent-Fail.)
- Nach Erfolg: `ai_reports` upsert (dedupe_key) — bereits via Client → wird zusätzlich serverseitig gespiegelt damit Doctor-Share-Pfad konsistent ist (analog `analyze-voice-patterns-shared`).
- Strukturierte Fehlercodes immer mit `code:` und `errorCode:`-Feld (Backwards-Kompat).

## 3) Edge Function `analyze-voice-patterns-shared` (Doctor-Share)
- Identische Quota-/Cooldown-Logik gegen **Patientenkonto** (`ownerUserId`).
- Bypass `ai_unlimited` des Patienten.
- Quota-Increment ebenfalls erst nach Validation OK.

## 4) Frontend `analysisEngine.ts`
- Map Edge-Status → `error.code`:
  - 401 → `AUTH_REQUIRED`
  - 403 + `AI_CONSENT_REQUIRED` → `AI_CONSENT_REQUIRED`
  - 403 + `AI_DISABLED` → `AI_DISABLED`
  - 409 + `QUOTA_EXCEEDED` → `QUOTA_EXCEEDED` (mit `usageCount`/`limit`)
  - 429 + `COOLDOWN_ACTIVE` → `COOLDOWN_ACTIVE` (mit `cooldownRemaining`)
  - 413 → `CONTEXT_TOO_LARGE`
  - 504 → `TIMEOUT`
  - 502/`LLM_UNAVAILABLE` → `LLM_UNAVAILABLE`
  - `Unavailable`-Body mit `errorReason` + `<10 Daten` → `INSUFFICIENT_DATA`
  - Sonst → `UNKNOWN`
- **Vor-Flight-Check**: lade `user_consents.has_ai_consent` + `user_profiles.ai_enabled/ai_unlimited` + `get_pattern_analysis_usage` (RPC bereits vorhanden) → liefert `{ canAnalyze, blockedReason, usageCount, limit, cooldownRemaining }`.

## 5) UI `MigrainePatternAnalysis.tsx`
- Pre-flight-Hook lädt zusätzlich Quota/Cooldown/Consent-Status.
- **Konsolidierte Aktions-Logik:**
  - Consent fehlt → CTA „Einwilligung erteilen" (Link zu Settings), Analyse-Button NICHT sichtbar; KEIN Edge-Call möglich.
  - AI deaktiviert → Hinweis + Settings-Link.
  - Quota erreicht → Button disabled, Hinweis „3/3 Analysen diesen Monat. Vorhandene Analyse weiter sichtbar." (zeigt evtl. vorhandene Analyse weiter an).
  - Cooldown aktiv → Button disabled mit Live-Countdown („Erneut möglich in 02:43").
  - Daten zu wenig → konkrete Info via Empty-State + `INSUFFICIENT_DATA`-Hinweis.
- **Cache-Badge:**
  - Wenn `selection.isFresh && Alter ≤ 14 Tage` → grünes „Aktuell" + Datum.
  - Sonst → gelbes „Veraltet" + Button „Neue Analyse erstellen" (sofern Quota+Cooldown ok).
- **TTL-Konstante** `STALE_AFTER_DAYS = 14` zentral in `analysisCache.ts`.

## 6) Europe/Berlin Zeitzone
- In `MigrainePatternAnalysis.tsx`: `new Date(from + 'T00:00:00')` ersetzen durch Helper, der ISO-Date in Berlin-Mitternacht/Ende konvertiert (zeitzone-sicher).
- Helper `berlinDayBoundaries(from, to)` zentral exportieren und auch in `analysisEngine` und Edge nutzen, falls dort Datumsgrenzen gebildet werden.

## 7) Cooldown
- Im UI Live-Countdown via `setInterval`. Bypass für `ai_unlimited` mit Hinweis-Tooltip.
- Im Edge bleibt Cooldown serverseitig erzwungen (Source of Truth).

## 8) Tests (Vitest)
Neue Tests in `src/lib/voice/__tests__/analysisGate.test.ts`:
- `gateDecision()` reine Funktion: liefert Aktion/Reason aus `{consent, aiEnabled, unlimited, usageCount, limit, cooldownRemaining, hasCache, isStale, dataSufficient}`.
- Cases: consent fehlt → block, 0/3 → allow, 3/3 unlimited=false → quota_exceeded, 3/3 unlimited=true → allow, cooldown 120s + unlimited=false → cooldown, isStale=true + slot frei → allow_new, hasCache+fresh → no_action_needed.

Bereits vorhandene Tests:
- `analysisCache.test.ts` (Cooldown, Stale, Signature) ✅
- Edge-Function-Tests via `supabase--test_edge_functions` für Prompt-Inhalte ✅

## 9) Berichte am Ende
A) Geänderte Dateien · B) (keine Migration) · C) Edge-Function-Diff (zwei Funktionen) · D) UI-Diff · E) Test-Output · F) Risiken · G) Nicht-Umgesetztes.

## Bestätigung
Bevor ich loslege bitte kurz bestätigen:
- **Quota 3/Monat** korrekt? (du hattest 3 vorgeschlagen)
- **TTL 14 Tage** für „Veraltet"-Badge korrekt? (in deinem aktuellen Brief explizit so)
- **`ai_unlimited` umgeht Cooldown** ja/nein? (du hattest „optional" geschrieben — ich empfehle JA, da Power-User/Devs sonst behindert werden)
- **Doctor-Share-Cooldown**: gleiche 5 Min auf Patientenkonto? Falls Patient gleichzeitig in App analysiert, könnte das blockieren — Alternative: kein Cooldown im Doctor-Share, nur Quota. (Empfehlung: kein Cooldown in Doctor-Share.)