## Phase 1 — Echte Veränderung erkennbar machen

Ziel: deterministische Trend-Berechnung + freundliches Dokumentationsfazit + Wettertage-Bug. Keine LLM-Umtexterei, sondern echte Zahlen.

### 1. Wettertage-Bug (Aufgabe 4 — sofort)

**Ursache:** `byDay.size` in `patternPreAnalysis.ts` und `weatherCoverage.ts` zählt unique `snapshot_date`, aber durch UTC/Berlin-Boundary kann eine 31. Datumszeile in den Filter rutschen (`gte fromDate / lte toDate` → Edge-Function bekommt 31 Tage). Außerdem wird die Anzeige nirgends auf `daysTotal` gekappt.

**Fix (1 Stelle, mit Wirkung überall):**
- `patternPreAnalysis.ts`: vor dem Befüllen von `byDay` `snapshot_date` auf die ersten 10 Zeichen normalisieren und nur akzeptieren, wenn `>= fromDate && <= toDate`.
- Bei Set/Display: `const weatherDaysCapped = Math.min(byDay.size, rangeDays)` → wird statt `byDay.size` ausgeliefert.
- Gleicher Cap in `src/lib/ai/buildAnalysisReportV21.ts` (Client-Pfad) und `src/lib/ai/weatherCoverage.ts` (`daysWithWeather/daysWithUsableWeather`).
- Texte bleiben „X von Y Tagen Wetterdaten", aber X ≤ Y garantiert.

V2.3 (Cron/Backfill/Migration/Provider) bleibt explizit unangetastet.

### 2. Neue Sektion „Verlauf & Veränderung" (Aufgabe 1+2)

Neues Modul `supabase/functions/_shared/report-v2/analysis/trendAnalysis.ts` (Deno, reine Funktion). Spiegel-Implementation als `src/lib/ai/trendAnalysis.ts` für Client-Pfad. Beide importieren denselben Algorithmus über shared Quelle (Deno-Datei kopiert in `_shared` + Re-export aus `src/lib/ai`).

**Eingaben:** sortierte `DayRecord[]` (existiert in `report-v2/aggregate.ts → countsByDay`) + `range`.

**Fenster-Splits (deterministisch):**
- `range ≤ 35 Tage` → erste Hälfte vs. zweite Hälfte (gleich groß, ungerade Tag fällt weg)
- `range 36–120 Tage` → letzter 30-Tage-Block vs. vorherige 30 + (optional) letzter Monat vs. 2 vorherige Monate
- `range > 120 Tage` → letzter Monat vs. vorheriger Monat
- Minimum: jedes Fenster ≥ 7 dokumentierte Tage, sonst `evidence: insufficient`, kein Trend-Claim

**Pro Fenster berechnete Metriken (`WindowStats`):**
`headacheDays, severeDays(≥7), medDays, triptanDays, otherAcuteDays, comboDays, severeWithoutAcute, triptanAvoidanceDays, mecfsDays, severeMecfsDays`. Raten gegen dokumentierte Tage im Fenster.

**Trendlabel pro Metrik:**
- |Δrate| < 0.1 → `stable`
- Δrate ≤ −0.1 und Δabs ≥ 1 → `decreased`
- Δrate ≥ +0.1 und Δabs ≥ 1 → `increased`
- sonst `unclear`

**Neue Findings (V2.1-konform, evidence_level=low/insufficient):**
- `trend.pain_burden` (Schmerztage + severeDays)
- `trend.acute_medication` (medDays gesamt)
- `trend.triptan_use` (triptanDays + Intakes)
- `trend.mecfs_energy`
- Spezial-Logik Triptan-vs-Schmerz: wenn `triptanDays decreased` UND `severeDays not decreased` → Text:
  „Die Daten sprechen eher für eine veränderte Akutstrategie als für eine klare Entlastung." (kein medizinischer Rat).

Findings werden im Builder (`buildDeterministicFindings` + Client `buildAnalysisReportV21`) eingehängt; neue `section_map`-Sektion `trend_changes`.

### 3. Dokumentationsfazit (Aufgabe 3)

Neue Builder-Sektion + Section-Map-Key `documentation_summary`.

**Berechnet aus existierenden Quellen** (kein neuer SQL):
`anyEntryDays = unique(dates aus pain_entries ∪ medication_intakes ∪ mecfs/contextNotes)`, `painDays`, `medDays`, `mecfsDays`, `contextNoteCount`, `effectRatingCount` (aus `medication_effects` falls dataset enthält), `weatherDaysCapped`.

**Stufen-Logik:**
- `anyEntryDays/rangeDays ≥ 0.8` → „Du hast an {n} von {N} Tagen Einträge dokumentiert. Die Grundlage für Verlauf und Belastung ist dadurch gut."
- `0.5–0.8` → „solide Grundlage", neutrale Detail-Hinweise
- `< 0.5` → freundlich „Für stabile Aussagen wären mehr Tage hilfreich" (kein „unzureichend", kein „Mangel")

**Detail-Hinweise (immer freundlich, additiv):** PEM/Belastung, Schlaf, Stress, Medikamentenwirkung — nur wenn Coverage < 0.5 jeweils.

**Negative Begriffe verboten** in dieser Sektion: `unzureichend`, `Mangel`, `fehlende schmerzfreie`, `erschwert die Identifizierung`. Lint-Test in Vitest stellt das sicher.

### 4. Wetter-Formulierung weicher (Aufgabe 4 zweiter Teil)

In `weather.pressure_drop` Finding: wenn `painRate >= 0.85` (fast nur Schmerztage), `plain_language_summary` ersetzt durch:
„Die Wetteranalyse bleibt vorsichtig, weil der Zeitraum fast durchgehend schmerzbelastet war."
`limitations` ohne „Mangel an schmerzfreien Vergleichstagen".

Wettervariablen (Temp/Druck/Δ24h/Humidity) bleiben in `deterministic_basis` für spätere V2.3-Auswertung.

### 5. UI-Reihenfolge (Aufgabe 5)

`src/features/ai-reports/components/AIReportDetail.tsx` + `src/lib/ai/generateAnalysisReportText.ts`: neue Section-Reihenfolge:
1 Datenbasis · 2 Auffälligste Hinweise · **3 Verlauf & Veränderung** · 4 Medikamente & Wirkung · 5 Wetter & Umwelt · 6 ME/CFS · 7 Schlaf/Stress · 8 Symptome/Aura · 9 Zeitmuster · **10 Dokumentationsfazit** (ersetzt „Datenqualität"-Box) · 11 Offene Fragen · 12 Grenzen.

`SECTIONS`-Array in `generateAnalysisReportText.ts` wird umsortiert, `data_quality`-Eintrag → `documentation_summary` mit Titel „Dokumentationsfazit". „Details anzeigen"-Logik unverändert.

### 6. Bericht/Kopieren (Aufgabe 6)

In `generateAnalysisReportText.ts`: Kopier-Text enthält Kurzfazit → Verlauf & Veränderung → Triptan-/Medikationstrend → Wetter (vorsichtig, max 2 Sätze) → Dokumentationsfazit. Keine harte Negativ-Sprache.

### 7. Tests (Aufgabe 7)

Neu/erweitert:
- `supabase/functions/_shared/report-v2/analysis/trendAnalysis_test.ts` (Deno) — Window-Split (30d, 90d, 180d), Trendlabel-Schwellen, Triptan-decreased + severe-stable Spezialfall.
- `src/lib/ai/__tests__/trendAnalysis.test.ts` (Vitest) — identische Erwartungen Client.
- `src/lib/ai/__tests__/documentationSummary.test.ts` — 29/30 → „gute Grundlage"; Lint-Regex verbietet `unzureichend|Mangel|fehlende schmerzfreie`.
- `src/lib/ai/__tests__/weatherCoverage.test.ts` — 31 Rows / 30 Tage → `daysWithWeather=30`, `daysWithUsableWeather ≤ 30`.
- `supabase/functions/_shared/patternPreAnalysis_test.ts` — gleicher Cap-Test serverseitig.

Build + Typecheck + relevante Vitest + Deno-Tests laufen am Ende.

### Technische Details

**Geänderte / neue Dateien:**
- `supabase/functions/_shared/report-v2/analysis/trendAnalysis.ts` (neu) + `_test.ts`
- `supabase/functions/_shared/patternPreAnalysis.ts` (Wetter-Cap, Trend-Findings, Dok-Fazit-Finding, weicher Wetter-Text)
- `supabase/functions/_shared/patternPreAnalysis_test.ts` (erweitert)
- `src/lib/ai/trendAnalysis.ts` (neu, deckt Client-Pfad)
- `src/lib/ai/buildAnalysisReportV21.ts` (Wetter-Cap, Trend, Dok-Fazit, Section-Map)
- `src/lib/ai/weatherCoverage.ts` (Cap)
- `src/lib/ai/generateAnalysisReportText.ts` (Section-Reihenfolge + Bericht)
- `src/lib/ai/analysisTypes.ts` (neue Finding-IDs / section_map keys: `trend_changes`, `documentation_summary`)
- `src/features/ai-reports/components/AIReportDetail.tsx` (Reihenfolge + neue Sektion)
- Tests s. o.

**Nicht geändert:** DB-Schema, Edge-Function-Verträge, Wetter-Provider/Cron/Backfill, RLS, UI-Theming.

**Nutzer-Aktion danach:** Cache invalidieren → neu analysieren (nicht nur Reload), weil Findings + section_map sich ändern; bestehende Cache-Einträge in `ai_analysis_cache` haben alte Struktur.