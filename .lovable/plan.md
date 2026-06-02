# Release-Polish KI-Analyse — Phase „Einschränkungen"

## 1. Prüfung: Fließt Medikamentenwirkung in die Analyse ein?

Befund (Code belegt):

- Tabelle `medication_effects` existiert und wird vom Feature `src/features/medication-effects/` (eigenes API + UI) genutzt.
- App-Pipeline: weder `src/lib/voice/analysisAccess.ts` noch `src/lib/voice/analysisContext.ts` lesen `medication_effects` (rg-Treffer: 0).
- `src/lib/ai/buildAnalysisReportV21.ts:356` setzt `effect_rating_count: null` hart.
- Server-Pipeline: `supabase/functions/_shared/serverAnalysisDataset.ts` lädt nur `pain_entries` + `medication_intakes`, keine `medication_effects`.
- `patternPreAnalysis.ts:122` definiert das Feld `effect_rating_count`, es bleibt aber `null`.
- Das LLM-Prompt enthält die Kategorie `medication_effect`, bekommt jedoch keine Wirkungsdaten als Input.

→ **Wirkungsdaten fließen aktuell NICHT in PreAnalysis, Prompt oder deterministische Findings ein.**

Folge für diesen Release: minimaler, nicht-invasiver Anschluss (Zählen vorhandener `medication_effects.effect_rating_0_4` im Zeitraum) — kein neues UI, keine Pflicht, keine Migration. Wenn ≥1 Wirkungsrating im Zeitraum existiert, werden alle „Wirksamkeit wird hier nicht bewertet" / „Medikamenten-Trend allein erlaubt keine Aussage zur Wirksamkeit" Einschränkungen unterdrückt.

## 2. Datei-Änderungen (klein, gezielt)

### a) Wirkungsdaten in App-Pipeline einbeziehen
- `src/lib/voice/analysisAccess.ts`: zusätzlich `medication_effects` (nur `entry_id`, `effect_rating_0_4`, `updated_at`) für Zeitraum laden, owner-gefiltert.
- `src/lib/voice/analysisContext.ts`: Anzahl bewerteter Einnahmen als `medicationEffectRatedCount` ausgeben.
- `src/lib/ai/buildAnalysisReportV21.ts`:
  - `effect_rating_count` aus Kontext statt `null`.
  - Limitation `"Wirksamkeit wird hier nicht bewertet."` und `"Ohne vollständige Dokumentation kann die tatsächliche Last höher oder niedriger sein."` nur noch konditional ausgeben (siehe c/d).

### b) Server-Pipeline minimal angleichen
- `supabase/functions/_shared/serverAnalysisDataset.ts`: zusätzlicher Select auf `medication_effects` (owner-gefiltert über entry_id-Join), nur Zählung in Meta.
- `supabase/functions/_shared/patternPreAnalysis.ts`: `effect_rating_count` aus Meta befüllen; gleiche konditionale Limitation-Logik wie App.

### c) Generische Einschränkungen entfernen / konditional machen
Betroffen:
- `src/lib/ai/curateFindingsV22.ts:266` — Burden-merged: Limitation `"Ohne vollständige Dokumentation …"` nur, wenn `documented_days / days_total < 0.8`, sonst leeres Array.
- `src/lib/ai/buildAnalysisReportV21.ts:152` (`burden.pain_days_share`) und `supabase/functions/_shared/patternPreAnalysis.ts:419` — selbe Bedingung `<0.8` Coverage.
- `src/lib/ai/buildAnalysisReportV21.ts:185` und Server-Pendant (`medication.acute_intakes`) — `"Wirksamkeit wird hier nicht bewertet."` entfällt, wenn `effect_rating_count ≥ 1`.
- `src/lib/ai/buildCourseTrendFindings.ts:67` und Server-Pendant — stabile Verlaufskarten: Limitation `"Verläufe brauchen längere Zeiträume …"` ersatzlos entfernen (Fallback `"… mindestens zwei dokumentierte Wochen …"` bleibt für `!hasEnoughData`).
- `buildCourseTrendFindings.ts:111` — `"Medikamenten-Trend allein erlaubt keine Aussage zur Wirksamkeit."` ersatzlos entfernen; `recommended_tracking_next` „Wirksamkeit der Akutmedikation pro Einnahme kurz bewerten." nur, wenn `effect_rating_count === 0`.

### d) Output-Policy als Sicherheitsnetz
- `src/lib/ai/analysisOutputPolicy.ts`: zentrale Regex-Liste erweitern um pauschale Floskeln, die auch durch LLM erzeugt werden könnten:
  - `/ohne vollständige Dokumentation/i`
  - `/Verläufe brauchen längere Zeiträume/i`
  - `/Medikamenten-Trend allein/i`
  - `/Wirksamkeit wird hier nicht bewertet/i`
  - `/keine Informationen zur Wirksamkeit/i`
  - `/Wirksamkeit fehlt/i`
  - `/nicht aus dem Datensatz ersichtlich/i`
  - `/nicht explizit dokumentiert/i`
  - `/Datenlage erschwert/i`
  Stripper greift bei `limitations[]`, `reasoning`, `summary` (wie bestehend) — wenn Doc-Coverage ≥ 0.8 bzw. `effect_rating_count ≥ 1` greift das Filter unbedingt; sonst nur stark gekürzt.

### e) Triptan-Vermeidung kürzen
- `curateFindingsV22.ts` (Triptan/Avoidance-Pfad): wenn Card-Text die genannten Phrasen enthält, durch Kurzform ersetzen:
  - Titel/Summary: „Hinweise auf Triptan-Zurückhaltung."
  - Optional 1 Doctor-Point: „Gründe können im Arztgespräch eingeordnet werden."
  - Keine `limitations`.

### f) Detailansicht (UI) — keine leeren Hinweisblöcke
- `src/components/PainApp/AnalysisV21Sections.tsx::FindingCard`: `limitationsShort` wird bereits gerendert nur falls vorhanden — keine Code-Änderung nötig, profitiert automatisch davon, dass `limitations` jetzt leer sein können.

## 3. Erhalten bleibt explizit

- Summary-first Layout, „Detaillierte Analyse anzeigen"-Toggle.
- Max. 3 Highlights, `pickTopHighlights`-Reihenfolge unverändert.
- Triptan-Kurzfristtrend (`medication_trend.acute_use_short_term`).
- Dokumentationsfazit genau einmal (suppressNegativeDataQualityWhenFriendlySummary).
- ME/CFS-Dedupe + neutraler Wortlaut.
- Wetter-Gating + subjectiveContextSignal.
- Legacy-Feld-Filterung, Report/Kopieren via `generateAnalysisReportText` mit identischer Curation.
- Arztfragen-Cap = 4.

## 4. Tests

Neu anlegen: `src/lib/ai/__tests__/curateFindingsV22.constraintRelease.test.ts`

| # | Test |
|---|---|
| 1 | Bei `documented_days=28, days_total=30` (≥80 %) erscheint keine Limitation `/ohne vollständige Dokumentation/i` mehr |
| 2 | Verlaufskarte (course_trend stable) hat keine Limitation `/Verläufe brauchen längere Zeiträume/i` |
| 3 | `medication.acute_intakes` mit `effect_rating_count=2` enthält keine Limitation `/Wirksamkeit wird hier nicht bewertet/i` |
| 4 | `medication_trend.acute_use` enthält keine Limitation `/Medikamenten-Trend allein/i` |
| 5 | Triptan-Avoidance-Card: Text enthält nicht `/nicht aus dem Datensatz ersichtlich/i` und `/nicht explizit dokumentiert/i` |
| 6 | Bei `effect_rating_count ≥ 1`: `analysisV21.data_basis.effect_rating_count` ≠ null und Output-Policy entfernt restliche Pauschalformulierungen |
| 7 | Bestehende Tests bleiben grün: `releasePolish`, `detailPolish`, `simplify`, `polish`, `subjectiveContextSignal`, `buildCourseTrendFindings` |

Server-Pendants in `supabase/functions/_shared/buildCourseTrendFindings.ts` + `patternPreAnalysis.ts` werden via existierender Deno-Tests (`patternAnalysisBuilder_test.ts`, `patternPreAnalysis_test.ts`) abgedeckt; bei Bedarf werden 1–2 Assertions ergänzt.

Ausführen: `npx vitest run`, `deno test supabase/functions/_shared/*_test.ts --allow-net --allow-env`, `tsc --noEmit`, `npm run build`.

## 5. Risiko / Rollback

Reine Text-/Konditional-Änderungen + ein neuer DB-Lesepfad auf bestehender Tabelle `medication_effects` (RLS ist owner-gefiltert, keine Schreibvorgänge). Kein Schema-, Prompt-Architektur- oder Wetter-Logik-Eingriff. Rollback = Revert der genannten Dateien.

## Antwort am Ende der Umsetzung (gewünschtes Format)

1. Geänderte Dateien
2. Ergebnis Prüfung Medikamentenwirkung
3. Änderungen an Einschränkungen
4. Detailansicht-Vereinfachung
5. Erhaltene bestehende Funktionen
6. Tests/Build
7. Muss ich neu analysieren oder reicht neu laden
