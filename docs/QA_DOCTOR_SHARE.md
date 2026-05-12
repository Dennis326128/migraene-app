# Live-QA: Doctor Share SSOT

Local-only QA helper for the Doctor-Share website integration.
**Never deploy as edge function. Run only from a developer machine.**

## ENV (alle Pflicht)

| Variable | Wert | Quelle |
|---|---|---|
| `QA_DEV_SECRET` | beliebig (z. B. `dev`) | lokaler Schutz, verhindert Auto-Run |
| `SUPABASE_URL` | `https://lzcbjciqrhsezxkjeyhb.supabase.co` | Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | Supabase → Project Settings → API → `service_role` |

> ⚠️ Service-Role-Key NIEMALS commiten, NIEMALS ins Frontend, NIEMALS in einem Browser-Tab.

## Voraussetzungen

- Deno installiert (`deno --version`)
- Test-Patient (UUID aus `auth.users`), idealerweise mit
  - Patient-Profil + Daten der letzten 90 Tage
  - `user_consents.ai_processing_consent = true`
  - `user_profiles.ai_enabled = true`

## Beispielbefehle

Pattern:
```bash
QA_DEV_SECRET=dev \
SUPABASE_URL=… \
SUPABASE_SERVICE_ROLE_KEY=… \
deno run --allow-env --allow-net scripts/qa-doctor-share.ts \
  --user <PATIENT_UUID> [FLAGS]
```

### A) Nur lesen, keine Generation, keine Tagesfaktoren
```bash
… --user $UID --include-ai
```

### B) Lesen + Website darf neu generieren
```bash
… --user $UID --include-ai --allow-generate
```

### C) Lesen + generieren + Tagesfaktoren
```bash
… --user $UID --include-ai --allow-generate --share-day-factors
```

### D) Bestehenden Share reaktivieren / verlängern
```bash
… --user $UID --reuse --include-ai --allow-generate
# erneuert share_active_until, behält den bisherigen Code
```

### Dry-Run (verfügbar, schreibt nichts)
```bash
… --user $UID --include-ai --allow-generate --dry-run
```
Gibt `dryRun: true` und einen Pseudo-Code aus, **schreibt aber weder `doctor_shares` noch `doctor_share_settings`**.

### Optionen

| Flag | Default | Limit |
|---|---|---|
| `--ttl-hours N` | 24 | max 168 (7 Tage) |
| `--include-ai` | false | – |
| `--allow-generate` | false | – |
| `--share-day-factors` | false | – |
| `--reuse` | false | benötigt aktiven Share |
| `--dry-run` | false | – |

## Ergebnis benutzen

Das Script gibt JSON mit `code` (z. B. `MKYG-8142`) aus.

1. Website öffnen, Code eingeben.
2. Browser-DevTools → Network → Aufruf an `get-shared-report-data` prüfen.
3. Generate-Button (falls sichtbar) → Aufruf an `analyze-voice-patterns-shared`.

## Cleanup nach Test

**Manuell deaktivieren** (empfohlen, Audit-trail bleibt):
```sql
UPDATE doctor_shares
   SET is_active = false,
       share_revoked_at = now(),
       revoked_at = now(),
       share_active_until = now()
 WHERE code_display = 'XXXX-XXXX';
```

**Komplett löschen** (Settings cascaden nicht automatisch — beide löschen):
```sql
DELETE FROM doctor_share_settings WHERE share_id IN
  (SELECT id FROM doctor_shares WHERE code_display = 'XXXX-XXXX');
DELETE FROM doctor_share_report_snapshots WHERE share_id IN
  (SELECT id FROM doctor_shares WHERE code_display = 'XXXX-XXXX');
DELETE FROM doctor_share_sessions WHERE share_id IN
  (SELECT id FROM doctor_shares WHERE code_display = 'XXXX-XXXX');
DELETE FROM doctor_shares WHERE code_display = 'XXXX-XXXX';
```

**Auto-Ablauf:** Mit `--ttl-hours` läuft `share_active_until` von selbst ab; `verifyDoctorAccess` blockt dann automatisch.

---

## Live-Test-Checkliste

Pro Konfiguration (A/B/C) durchgehen:

- [ ] **Code-Eingabe**: Website akzeptiert den frisch generierten Code
- [ ] **`get-shared-report-data` Response**:
  - [ ] HTTP 200
  - [ ] `share.allowAiGenerate` matched Flag
  - [ ] `share.shareDayFactors` matched Flag
  - [ ] `share.aiConsentState === "granted"`
  - [ ] `share.aiEnabledState === "enabled"`
  - [ ] `quotaState.{remaining,limit,resetAtISO,isUnlimited}` plausibel
  - [ ] `dataStateSignature` startet mit `sha256:`
  - [ ] `latestRelevantDataAt` ist ISO oder null
- [ ] **`latestAiReport`**:
  - [ ] sichtbar mit `summaryMd` (Markdown sauber gerendert)
  - [ ] `source ∈ {patient, doctor}`, `validationStatus ∈ {ok, fallback}`
- [ ] **`dayFactors`**:
  - [ ] **nur** bei Konfiguration C im JSON enthalten
  - [ ] `JSON.stringify(response)` enthält **keine** Freitext-Tokens (Test-Patient sollte beim Tageszustand „TEST_FREITEXT_LEAK_CHECK" eingeben → darf NICHT auftauchen)
  - [ ] keine `audioUrl`, keine `rawTranscript`, kein `notes`
- [ ] **Generate-Button** (Konfiguration B/C):
  - [ ] Sichtbar nur wenn `share.allowAiGenerate === true`
  - [ ] Klick → HTTP 200 von `analyze-voice-patterns-shared`
  - [ ] In `ai_reports` neue Zeile (`source = 'doctor_share'`, `data_state_signature` gesetzt)
  - [ ] `user_ai_usage.request_count` für Patient +1 (außer `ai_unlimited`)
  - [ ] Reload → `latestAiReport.id` zeigt neue Analyse, `isStale = false`
- [ ] **Konfiguration A**: Klick auf Generate → HTTP 403 `AI_GENERATE_NOT_ALLOWED`
- [ ] **Quota-Voll-Test** (optional): manuell `user_ai_usage.request_count = 3` setzen → 409 `QUOTA_EXCEEDED`, kein Increment
- [ ] **Consent-Off-Test**: `user_consents.consent_withdrawn_at = now()` → `share.aiConsentState = "revoked"`, Generate → 403 `AI_CONSENT_REQUIRED`
- [ ] **Stale-Test**:
  1. Snapshot `dataStateSignature` notieren
  2. App: einen Painentry oder Tageszustand ändern
  3. Reload → Signatur **anders** und `isStale = true`
  4. Generate ausführen → `isStale = false`
- [ ] **Cleanup** (siehe oben) ausgeführt

## Häufige Fehler

| Fehlerbild | Ursache |
|---|---|
| `Refusing to run: QA_DEV_SECRET …` | Env nicht gesetzt |
| `Insert share failed: …` | falsche Service-Role oder Patient existiert nicht |
| Website 401 | Code abgelaufen (`share_active_until` < now) → `--reuse` |
| Website 403 `AI_NOT_ENABLED_FOR_SHARE` | Vergessen `--include-ai` zu setzen |
