# Release-Audit: KI-Analyse & Datenschutz (Miary)

## 1. KI-Anbieter

**Tatsächlich genutzt:** Ausschließlich **Lovable AI Gateway** (`https://ai.gateway.lovable.dev/v1/chat/completions`) mit Modell **`google/gemini-2.5-flash`** (in `analysisCore.ts` an einer Stelle noch `'none'` als Fallback-Tag).
**OpenAI wird NICHT genutzt** – kein einziger Aufruf an `api.openai.com` im Repo. Der einzige `OpenAI`-String stammt aus `sttConfig.ts` (Konfigurationstyp für künftigen optionalen Whisper-Provider, derzeit `browser_only`-Default, kein Key aktiv).

→ Privacy Policy & Auftragsverarbeiter-Liste müssen **Google (Gemini via Lovable AI Gateway)** nennen, nicht OpenAI.

## 2. API-Key Speicherort

- `LOVABLE_API_KEY` liegt **ausschließlich** in Supabase Edge Function Env (`Deno.env.get('LOVABLE_API_KEY')`) – bestätigt in allen 9 AI-Functions.
- Kein Vorkommen von `OPENAI_API_KEY`, `sk-…`, `LOVABLE_API_KEY` im Frontend (`src/`), `public/`, `.env` (nur Anon-Key + Public Config). Bestätigt sauber.

## 3. Funktionen mit LLM-Aufruf

| Edge Function | Frontend-Aufrufer | Zweck |
|---|---|---|
| `analyze-voice-patterns` | `src/lib/voice/analysisEngine.ts` | Pattern-Analyse App |
| `analyze-voice-patterns-shared` | `src/pages/DoctorReportView.tsx` | Pattern-Analyse Doctor-Share |
| `analyze-voice-notes` | (Voice-Pipeline) | Sprachnotiz-Klassifikation |
| `generate-ai-diary-report` | `src/components/PainApp/DiaryReport.tsx` | Tagebuch-Report |
| `generate-diary-analysis` | – | Variante |
| `generate-doctor-summary` | `DiaryReport.tsx` | Arztbrief-Zusammenfassung |
| `ask-assistant` | `VoiceQAOverlay.tsx` | Q&A-Assistent |
| `ai-draft-from-text` | `llmDraftEngine.ts` | Draft-Komposition |
| `parse-medication-effect` | (Medikamentenfluss) | Medi-Wirkung |
| `extract-voice-entry` / `extract-context-segments` | Voice-Pipeline | Extraktion |

Alle Aufrufe gehen **server-seitig**. Doctor-Share ruft die `*-shared`-Edge-Function via HMAC-Token (`x-doctor-access`) auf – **kein LLM-Call aus dem Doctor-Frontend**.

## 4. Welche Daten gehen an den Anbieter

- Symptome, Schmerz-Level, Medikationen, Trigger, Aura, Wetter, Schlaf, Zyklus, freie Notizen, Sprach-Transkripte, optionale private Notizen (`includePrivateNotes: true` in `analyze-voice-patterns` App-Pfad).
- **Doctor-Share-Pfad** (`patternAnalysisBuilder` mit `includePrivateNotes: false`) filtert private Notizen korrekt heraus (SSOT).
- **Direkte Identifikatoren:** Es wird **kein E-Mail, Name, User-ID, Geräte-ID** in den LLM-Prompt geschrieben. User-ID erscheint nur **gekürzt (`slice(0,8)…`)** in Server-Logs, nicht im Prompt.

## 5. Datenminimierung – Empfehlungen

- **App-Pfad sendet private Notizen** (`includePrivateNotes: true`). Memory sagt: „Private Notizen werden aus Exports/Reports ausgeschlossen". Für KI-Analyse aktuell eingeschlossen – sollte **explizit per separatem Consent-Toggle** oder default-`false` werden. Mind. in Privacy Policy klar deklarieren.
- Empfehlung: Konfigurations-Flag `aiIncludePrivateNotes` in `user_settings`, default `false`.

## 6. Logging

**Sauber:**
- `analyze-voice-patterns`: nur User-ID-Prefix + Zähl-Metadaten, keine Inhalte.
- `aiConsentGate`: nur ID-Prefix.
- `analyze-voice-patterns-shared` Kommentar dokumentiert „No PHI/health data, transcripts, or notes in logs".

**Zu prüfen / Risiko:**
- `ask-assistant/index.ts:73` → `console.log("📝 Ask Assistant: \"${question.substring(0, 50)}...\"")` → **Userfrage (potentiell Gesundheitsdaten) im Log**. Vor Release entfernen oder auf reine Längenangabe reduzieren.
- `ask-assistant/index.ts:109` → nur Zähler, OK.
- `generate-ai-diary-report` loggt nur Zähler & RequestId, OK.
- `llmDraftEngine.ts:233` Client-Log „Calling ai-draft-from-text" – harmlos (kein Inhalt), kann bleiben oder hinter DEV-Flag.

→ **Fix:** `ask-assistant` Logzeile 73 entfernen.

## 7. Consent

- DB-RPC `has_ai_consent` + `requireAiConsent`-Gate in **allen** LLM-Edge-Functions vorhanden. Returns 403 `AI_CONSENT_REQUIRED` wenn fehlt.
- Doctor-Share zusätzlich `evaluateShareAnalysisGate` (eigener Share-Toggle `include_ai_analysis`).
- Medical Disclaimer Komponenten existieren („ersetzt keine ärztliche Beratung/Diagnose/Behandlung").
- **Lücke:** Im Consent-Text muss explizit stehen, dass **Gesundheitsdaten zur KI-Analyse an Google (Gemini) via Lovable AI Gateway** übermittelt werden (Drittanbieter, USA-Bezug → Art. 9 + Art. 49 DSGVO). Aktuell generisch „KI-gestützte Funktionen". → **Pflicht-Fix vor Release.**

## 8. Privacy Policy – Lücken

`src/pages/PrivacyPolicy.tsx` enthält Platzhalter `[SUBPROCESSORS_LIST]` (Zeile 232) und nennt **weder Google noch Lovable noch Gemini**. Zwingend zu ergänzen:

**Abschnitt 6 (Auftragsverarbeiter):**
> **6.4 KI-Analyse:** Für die KI-gestützte Musteranalyse, Sprach-Transkription und Berichts­generierung werden pseudonymisierte Tagebuch­daten (Symptome, Schmerz­werte, Medikation, Trigger, Wetter, ggf. Sprach-Transkripte) an die **Lovable AI Gateway (Lovable GmbH)** übermittelt, die als Auftragsverarbeiter nach Art. 28 DSGVO das Modell **Google Gemini 2.5 Flash (Google Ireland Ltd. / Google LLC, USA)** als Sub-Auftragsverarbeiter einsetzt. Rechtsgrundlage: ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO. Übermittlung in Drittland (USA) erfolgt auf Basis EU-US Data Privacy Framework / Standard­vertragsklauseln. Es werden **keine direkten Identifikatoren** (Name, E-Mail, User-ID) übermittelt. Die Einwilligung ist jederzeit in den Einstellungen widerrufbar.

**Abschnitt 7.1:** ergänzen, dass Sprach­erkennung derzeit ausschließlich **lokal im Browser** läuft (kein Provider-Upload), solange `STT_MODE=browser_only`.

## 9. Doctor Share

- Ärzte können KI-Analyse **neu triggern** (`handleGenerateAi` in `DoctorReportView.tsx`).
- Trigger geht **server-seitig** via `analyze-voice-patterns-shared` mit HMAC-Token; Owner-User-ID wird **nicht aus Request-Body**, sondern aus validiertem Share-Payload gelesen.
- Gates: Doctor-Token gültig → Share nicht widerrufen → Owner-`has_ai_consent` → Share-Flag `include_ai_analysis`. Sauber.
- Privacy Policy muss erwähnen, dass auch der Arzt KI-Analysen erzeugen kann (geknüpft an Patienten-Consent).

## 10. Release-Fazit

### A) Bereits korrekt
- Kein OpenAI; alle LLM-Calls server-seitig via Lovable AI Gateway / Gemini.
- `LOVABLE_API_KEY` nur in Edge-Function-Env, nicht im Client.
- Consent-Gate (`requireAiConsent`) in allen 9 AI-Functions.
- Doctor-Share-Trigger sauber server-seitig, Owner-ID nicht aus Body, separater Share-Gate.
- User-ID nur gekürzt geloggt, keine Prompts in Function-Logs (mit 1 Ausnahme).
- `includePrivateNotes:false` für Doctor-Share, `true` für App-Eigentümer.

### B) Vor App-Store-Release zu ändern (Pflicht)
1. **`ask-assistant/index.ts` Zeile 73** – Klartext-Frage-Logging entfernen.
2. **Privacy Policy** (`src/pages/PrivacyPolicy.tsx`):
   - Platzhalter `[SUBPROCESSORS_LIST]` durch echte Liste ersetzen.
   - Neuer Abschnitt 6.4 (Google Gemini / Lovable AI Gateway, Drittland USA, Rechtsgrundlage Art. 9 II a + Art. 49).
   - 7.1 präzisieren (lokale Browser-STT).
   - 7.2 ergänzen: Doctor-Share kann ebenfalls KI-Analyse triggern.
3. **Consent-Text** (Komponenten unter `src/features/consent/`) muss Google/Gemini + Drittland-Hinweis enthalten – aktuell zu generisch.
4. **App-Pfad `analyze-voice-patterns`**: Entweder `includePrivateNotes` per User-Setting opt-in (default `false`) machen, oder im Consent-Text + Privacy Policy explizit ausweisen.
5. `.env`: `VITE_ENABLE_QA="false"` für Production-Build.

### C) Optional / Nice-to-have
- `llmDraftEngine.ts:233` Client-Log hinter `import.meta.env.DEV` (Information leak gering, aber unnötig).
- `analysisCore.ts` Fallback-`model:'none'`-Branch dokumentieren oder entfernen.
- Audit-Log-Eintrag „AI_ANALYSIS_TRIGGERED" pro Aufruf (DSGVO-Nachweis), aktuell nur Quota-Tracking.

### Betroffene Dateien (Kurzliste)
- `supabase/functions/ask-assistant/index.ts` (Log-Fix)
- `src/pages/PrivacyPolicy.tsx` (Inhalt)
- `src/features/consent/components/*` (Consent-Wording)
- `supabase/functions/analyze-voice-patterns/index.ts` + `patternAnalysisBuilder.ts` (Private-Notes-Flag)
- `src/features/settings/*` (neues Setting `aiIncludePrivateNotes`, falls Opt-in gewählt)
- `.env` (`VITE_ENABLE_QA=false`)

## Nächster Schritt

Soll ich in Build-Mode wechseln und die **Pflicht-Fixes B1–B3** umsetzen (Log-Zeile entfernen + Privacy Policy + Consent-Text)? B4 (Private-Notes-Setting) bitte separat bestätigen, da es eine kleine UX-Änderung in den Einstellungen bringt.
