
## Ausgangslage (Befund)

Der gewünschte Endpoint existiert bereits: **`POST /functions/v1/analyze-voice-patterns-shared`**.

Er macht heute schon fast alles, was im Auftrag steht:

- Auth via `x-doctor-access` + DB-Check (`verifyDoctorAccess`)
- Owner aus Token, niemals aus Body
- `has_ai_consent` (Owner)
- Unified `evaluateShareAnalysisGate` (`include_ai_analysis`, `allow_ai_generate`, share active/expiry, 15-min Cooldown)
- `ai_enabled` Owner-Profil-Gate
- **Quota auf Owner** via `checkPatternAnalysisQuota` mit `FREE_PATTERN_ANALYSIS_MONTHLY = 5` (Konstante steht in `_shared/aiQuotaGate.ts`)
- Gleiche Pipeline wie App: `buildServerAnalysisDataset` → `buildPatternPreAnalysis` → `buildDeterministicFindings` (V2.1) → `runPatternAnalysisV22` (gleicher Builder wie App)
- Persistiert in `ai_reports` (Owner, `source='doctor_share'`, `dedupe_key=pattern_analysis_<from>_<to>`, `data_state_signature`)
- Markiert `doctor_share_report_snapshots.is_stale=true`
- Sanitization & Doctor-Share-Safety: `serverAnalysisDataset` strippt private Notizen, `mergeExpandedFindingsIntoReport` schließt `red_flag`-Findings aus
- `get-shared-report-data` liefert bereits `latestAiReport.patternAnalysisV21` (live aus `ai_reports`, sanitized über `getDoctorShareSafeAnalysis`) sowie `quotaState`, `dataStateSignature`, `isStale`, `share.{allowAiGenerate, aiConsentState, aiEnabledState}`

→ Es muss kein zweiter Endpoint gebaut werden. Vier Lücken bleiben.

## Lücken vs. Auftrag

1. **Idempotenz / Credit-Schutz:** Aktuell verbraucht jeder erfolgreiche Trigger einen Credit (5/Monat), Schutz ist nur der 15-min-Cooldown. Auftrag verlangt: wenn aktuelle Analyse für selben Zeitraum + selbe `data_state_signature` existiert → diese zurückgeben, kein Credit, kein LLM-Call.

2. **Frontend-Hints in `get-shared-report-data`:** Die Website soll ohne Eigenlogik wissen, welcher Zustand gilt (vorhanden / erzeugbar / Limit erreicht / cooldown / disabled). Heute muss die Website das aus `latestAiReport + quotaState + share.* + isStale` selbst ableiten — fehleranfällig.

3. **PDF nach Trigger:** App-PDF wird clientseitig in der App gebaut (`src/lib/pdf/report.ts`) und in Storage abgelegt; `get-shared-report-pdf` liefert nur diese eingefrorene Datei. **Eine Website-getriggerte Analyse kann die Storage-PDF nicht aktualisieren.** Das muss klar dokumentiert und im Response signalisiert werden, statt einen falschen „PDF identisch"-Eindruck zu erzeugen.

4. **Konsens-Block-Text:** App-Backend blockt mit `AI_CONSENT_REQUIRED` („Patient hat KI-Verarbeitung nicht freigegeben"). Auftrag sagt: dieses Wording soll auf der Website nicht erscheinen. Wir lassen die Backend-Gate-Logik wie heute (DSGVO Art. 9, nicht entfernbar), passen aber den Fehlertext neutral an und lassen die Website über `aiConsentState` selber das passende Wording entscheiden.

## Änderungen (eng begrenzt)

### A) `analyze-voice-patterns-shared` — Idempotenz + Reuse

Vor Quota-Check + LLM-Call:

```text
1. ds = computeDataStateSignature(owner, from, to)
2. SELECT * FROM ai_reports
     WHERE user_id=owner AND report_type='pattern_analysis'
       AND dedupe_key='pattern_analysis_<from>_<to>'
       AND data_state_signature = ds.signature
     ORDER BY created_at DESC LIMIT 1
3. Wenn vorhanden:
     - Snapshot stale=true (damit get-shared-report-data den frischen Report liefert)
     - return 200 { reused: true, ...existing.response_json }
     - KEIN Quota-Commit, KEIN LLM-Call, Cooldown-Gate gilt trotzdem
```

Cooldown (15 min) bleibt als zusätzlicher Schutz vor Doppelklicks bestehen — er greift nur, wenn `reused`-Pfad nicht trifft (z. B. weil neue Daten die Signature ändern).

### B) `get-shared-report-data` — Trigger-Status-Block

Neu im Response (additiv, keine Breaking Changes):

```text
aiAnalysis: {
  hasModernAnalysis: boolean,           // latestAiReport?.patternAnalysisV21 vorhanden
  isStale: boolean,                     // bestehender computeIsStale
  canTrigger: boolean,                  // gate.allowed && quota.remaining>0
  blockedReason:                        // erste zutreffende Ursache (string|null)
    | 'share_inactive' | 'share_expired'
    | 'ai_analysis_not_included' | 'ai_generation_not_allowed'
    | 'cooldown_active' | 'ai_disabled_owner' | 'ai_consent_missing'
    | 'quota_exceeded' | null,
  cooldownWaitMinutes: number|null,     // bei cooldown_active
  quota: { used, limit, remaining, isUnlimited }  // bereits in quotaState
}
```

Implementierung: gleiche Eingaben wie heute (`shareSettings`, `shareRow`, letzter `pattern_analysis`-Eintrag, `quotaState`, `aiConsentState`, `aiEnabledState`) → `evaluateShareAnalysisGate` + Quota-Check ohne Commit aufrufen, Ergebnis in `aiAnalysis.*` mappen.

### C) PDF-Verhalten ehrlich signalisieren

Im `get-shared-report-data`-Response zusätzlich:

```text
pdfFreshness: {
  pdfFilePath: string|null,
  pdfCreatedAt: ISO|null,
  latestAnalysisAt: ISO|null,
  pdfReflectsLatestAnalysis: boolean   // pdfCreatedAt >= latestAnalysisAt
}
```

Damit kann die Website neben dem Download anzeigen: „Das PDF zeigt die Analyse vom <Datum>. Für ein PDF mit der neuen KI-Zusammenfassung muss der Patient in der App einen neuen Bericht erstellen." Es wird **kein** serverseitiger PDF-Renderer gebaut (das wäre ein Parallelpfad zur App-PDF-Pipeline und widerspricht dem Projektprinzip „eine PDF-Quelle"). Falls später automatische Regenerierung gewollt ist, müsste die PDF-Erzeugung in eine Edge Function ausgelagert werden — bewusst nicht Teil dieses Schritts.

### D) Konsens-Block-Text neutralisieren

In `analyze-voice-patterns-shared`: `AI_CONSENT_REQUIRED`-Meldung in eine neutrale Form ändern (z. B. „KI-Analyse für diese Freigabe aktuell nicht möglich.") — die Website nutzt ohnehin `aiAnalysis.blockedReason` für UI-Wording.

## Tests

Neu / erweitert:

- `analyze-voice-patterns-shared`
  - Reuse: gleiche Signature → `reused: true`, Quota unverändert, kein LLM-Call (LLM gemockt)
  - Neuer Trigger: Signature drift → Quota commit, LLM-Call läuft
  - Quota exceeded → 409 `QUOTA_EXCEEDED`, kein DB-Write
  - Cooldown aktiv → 429 `ANALYSIS_COOLDOWN_ACTIVE`
  - Ungültiger Token → 401
  - Gate „ai_generation_not_allowed" → 403
- `get-shared-report-data`
  - Liefert `aiAnalysis`-Block in allen Zuständen (none / fresh / stale / quota / cooldown / disabled)
  - Liefert `pdfFreshness` korrekt (älter als latest analysis ⇒ `pdfReflectsLatestAnalysis=false`)
- `shareAnalysisGate.test.ts`: bestehende Tests bleiben grün
- Vitest gesamt + `tsc --noEmit` + Build

## Was nicht passiert

- Kein neuer Endpoint `create-shared-ai-analysis` — bestehender wird genutzt
- Keine Änderungen an `FREE_PATTERN_ANALYSIS_MONTHLY`, `analysisCore`, `patternAnalysisBuilder`
- Keine Änderungen am App-PDF-Builder
- Keine Änderungen an Legacy-KI-Feldern (`possiblePatterns` etc. bleiben unangetastet, werden weder gelesen noch geschrieben)
- Keine Änderung am Storage-Bucket-Layout

## Geänderte Dateien (Voraussicht)

- `supabase/functions/analyze-voice-patterns-shared/index.ts` (Idempotenz-Block + Fehlertext)
- `supabase/functions/get-shared-report-data/index.ts` (aiAnalysis + pdfFreshness)
- `supabase/functions/_shared/shareAnalysisGate.ts` (evtl. exportiertes Mapping `reason → blockedReason`-Strings, falls geteilt benötigt)
- neue Tests unter `supabase/functions/analyze-voice-patterns-shared/*_test.ts` und `supabase/functions/get-shared-report-data/*_test.ts`

## Antwort an Website-Projekt (nach App-Umsetzung)

Endpoint: `POST {SUPABASE_URL}/functions/v1/analyze-voice-patterns-shared`, Header `x-doctor-access`, leerer Body. Antwort enthält `analysisV21` und (neu) `reused: boolean`. Anschließend `get-shared-report-data` neu laden und `aiAnalysis.*` + `pdfFreshness.*` für UI/Buttons nutzen. PDF weiterhin nur über `get-shared-report-pdf?historyDiaryId=…`.
