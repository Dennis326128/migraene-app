# Release-Fix KI-Analyse — Plan

Ziel: Praxistauglichere, kürzere Analyse ohne neue Architektur. Wir ändern Prompt, Curation-Gates und UI/Report-Rendering. Kein neues Schema, kein Wetter-V2.3, keine Migration.

## 1. Prompt entschlacken (`supabase/functions/_shared/analysisCore.ts`)

- Entfernen: „MINDESTENS 8 sinnvolle Einträge", „2–4 stärkste Muster", „4–8 zusätzliche Hinweise", Pflicht-Wetter-Hinweis, Pflicht-Sektionen A–H.
- Entfernen: Pflichtprüfung Wetter, die immer mind. 1 Eintrag erzwingt.
- Entfernen: erzwungener `fatigueContextFindings`-Eintrag „ME/CFS-Daten nicht ausreichend".
- Neuer Leitsatz (sinngemäß): „Weniger ist besser. Nur praktisch relevante Hinweise. Stabile/triviale Beobachtungen NICHT als Findings. Wetter nur bei konkretem plausiblem Zusammenhang oder subjektivem Hinweis. ME/CFS gebündelt, nicht verstreut. Datenlücken nur als freundlicher Detailhinweis, nicht als prominente Karte bei guter Tagesdokumentation."
- `summary` weiter 2–3 Sätze; Sektionsschema bleibt unverändert (Arrays dürfen jetzt aber leer sein).
- Deno-Test `analysisCore_prompt_test.ts` anpassen + neue Assertions: kein „mindestens 8", keine Wetter-Pflicht, „weniger ist besser" enthalten.

## 2. Legacy-Rohlisten standardmäßig nicht rendern (`src/components/PainApp/AnalysisV21Sections.tsx` + ggf. `MigrainePatternAnalysis.tsx`)

- Wenn `analysisV21` vorhanden ist: NUR rendern: `data_basis`, Summary, kuratierte Highlights, kuratierte `findings`, kuratierte `openQuestions`, Grenzen.
- `possiblePatterns`, `painContextFindings`, `fatigueContextFindings`, `medicationContextFindings`, `recurringSequences`, `confidenceNotes` werden bei vorhandenem `analysisV21` NICHT mehr gerendert.
- Fallback-Pfad (kein `analysisV21`): Legacy-Felder weiter rendern, aber durch `sanitizeOutputText` / `applyOutputPolicy` schicken.
- Bestehende Konstante `MAX_HIGHLIGHTS` von 4 → **3**.

## 3. ME/CFS-Dedupe (`src/lib/ai/curateFindingsV22.ts`)

- Nach Curation, vor Output-Policy: Topic-Dedup für `mecfs_*` / `fatigue_*` Findings:
  - max. 1 ME/CFS-Karte in Highlights (höchste Evidenz gewinnt; Trend „nur seltener dokumentiert" wird nicht zum Highlight befördert).
  - max. 1 ME/CFS-Block in Details (übrige ME/CFS-Findings werden zusammengeführt oder verworfen).
  - keine separate PEM-Mangelkarte parallel zum ME/CFS-Block.
- `mecfs_energy_trend` mit `direction:"unchanged"` oder nur Dokumentationshäufigkeit: nicht in Highlights, höchstens kurzer Detail-Satz.

## 4. Stabile Trends aus Highlights (`curateFindingsV22.ts`)

- Findings vom Typ `course_trend`, `medication_trend`, `mecfs_energy_trend` mit `direction:"unchanged"` oder kleinem Delta: aus Highlights ausschließen.
- Highlights-Priorisierung (Sortier-Score):
  1. echte Verschlechterung
  2. echte Verbesserung
  3. relevante Änderung Akutstrategie (Triptan-Kurzfrist)
  4. hohe Schmerzlast
  5. ein starkes ME/CFS-/Wetter-/Medikamenten-Signal

## 5. Triptan-Kurzfristtrend priorisieren (`src/lib/ai/buildCourseTrendFindings.ts` + Mirror in `supabase/functions/_shared/`)

- 10-vs-10-Logik existiert bereits — sicherstellen, dass das Triptan-Kurzfrist-Finding:
  - vor `medication_trend` „stabil" priorisiert wird (Score-Bump),
  - in `buildAnalysisOverviewSummary` in den Summary-Text einfließt (statt „Akutmedikation stabil"),
  - bei hoher Schmerzlast → Text „veränderte Akutstrategie", bei sinkender Schmerzlast → „vorsichtige Entlastung".

## 6. Wetter-Gating verschärfen (`curateFindingsV22.ts` / `analysisOutputPolicy.ts`)

- Wetter-Findings mit `evidenceLevel:"low"` ohne subjektiven Bezug oder klare Korrelation: nicht in Highlights, in Details nur, wenn Mehrwert vorhanden.
- „möglicher Verstärkungsfaktor" ohne praktische Aussage: verwerfen.
- Wenn kein klarer Wetterzusammenhang: Summary darf nur einen kurzen Satz enthalten oder Wetter gar nicht erwähnen.

## 7. Dokumentationsfazit als einziges DQ-Finding

- `injectFriendlyDocSummaryIfNeeded` existiert. Erweitern: bei vorhandenem freundlichen Fazit werden ALLE anderen `data_quality`-Findings (inkl. „Tagesfaktoren fehlen", „PEM-Daten fehlen") aus Highlights und Details verworfen — bereits teilweise in `analysisOutputPolicy` (`hasFriendlyDocSummary`); Filter erweitern und sicherstellen, dass auch positive Coverage (<90 %) genau ein DQ-Finding emittiert.

## 8. „Weitere mögliche Zusammenhänge" entschärfen (`AnalysisV21Sections.tsx` + `curateFindingsV22.ts`)

- `weaker`-Sektion: vor Render Findings deduplizieren gegen Hauptthemen (Schmerzlast, ME/CFS, Wetter, Medikation, DQ) — wenn Titel/Kategorie überlappt → verwerfen.
- Wenn nach Dedup leer: Sektion komplett ausblenden (UI + Report).

## 9. Initiale Ansicht & Report (`AnalysisV21Sections.tsx`, `generateAnalysisReportText.ts`)

- Initial: Datenbasis → Summary → max. 3 Highlights → Button „Detaillierte Analyse anzeigen".
- Report: identische 3-Highlight-Grenze; Cap `strongest` von 3 unverändert; Legacy-Rendering im V2.1-Pfad weiterhin entfernt; Arztfragen-Cap 5 + Dedup auf normalisierten Text.

## 10. Tests (Vitest + Deno)

- `analysisCore_prompt_test.ts`: neue Assertions (kein „mindestens 8", keine Wetter-Pflicht, „weniger ist besser").
- `curateFindingsV22.test.ts`:
  - ME/CFS-Dedupe: nur 1 Highlight + 1 Detailblock bei mehreren ME/CFS-Findings.
  - `direction:"unchanged"` → kein Highlight.
  - Wetter low ohne Subjektivbezug → kein Highlight.
  - Friendly DocSummary → keine weiteren DQ-Karten.
- Neuer Test `AnalysisV21Sections.test.tsx` (oder Erweiterung): bei vorhandenem `analysisV21` werden Legacy-Felder NICHT gerendert.
- `generateAnalysisReportText.test.ts`: max. 3 Highlights, keine Legacy-Listen, max. 5 dedupliziete Arztfragen.
- `buildCourseTrendFindings.test.ts`: 10-vs-10 Triptan-Rückgang → Highlight; Wording-Varianten je nach Schmerzlast.

## 11. Build & Verify

- `npx vitest run` (relevante Suites).
- `deno test supabase/functions/_shared/analysisCore_prompt_test.ts` (sowie `trendAnalysis_test`, falls vorhanden).
- `npm run build` läuft via Lovable automatisch.

## Betroffene Dateien (Übersicht)

**Geändert:**
- `supabase/functions/_shared/analysisCore.ts` (Prompt)
- `supabase/functions/_shared/analysisCore_prompt_test.ts`
- `src/lib/ai/curateFindingsV22.ts` (ME/CFS-Dedupe, Trend-Gating, Wetter-Gating, weaker-Dedup, DQ-Konsolidierung)
- `src/lib/ai/analysisOutputPolicy.ts` (Friendly-DocSummary-Filter erweitern, optional)
- `src/lib/ai/buildAnalysisOverviewSummary.ts` (Triptan-Kurzfrist priorisieren, Wetter-Stillschweigen erlauben)
- `src/lib/ai/buildCourseTrendFindings.ts` + `supabase/functions/_shared/buildCourseTrendFindings.ts` (Priorisierung Kurzfristtrend)
- `src/components/PainApp/AnalysisV21Sections.tsx` (Legacy aus, MAX_HIGHLIGHTS=3, weaker ausblenden wenn leer)
- `src/lib/ai/generateAnalysisReportText.ts` (Cap 3, Legacy aus, Arztfragen-Dedup)

**Tests (neu/erweitert):**
- `src/lib/ai/__tests__/curateFindingsV22.test.ts`
- `src/lib/ai/__tests__/generateAnalysisReportText.test.ts`
- `src/components/PainApp/__tests__/AnalysisV21Sections.test.tsx` (neu, klein)
- `supabase/functions/_shared/analysisCore_prompt_test.ts`

## Antwort am Ende des Builds

User-Antwortblock 1–9 wie spezifiziert. Erwartete Antwort auf Punkt 9: **„Neu laden reicht"** für UI-/Curation-/Sanitizer-/Legacy-Render-Änderungen. **Neu analysieren** ist nur nötig für den entschlackten Prompt (sonst läuft die alte LLM-Antwort weiter durch die neue, strengere Curation — funktioniert, aber Prompt-Vorteile fehlen).
