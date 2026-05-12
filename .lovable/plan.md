## Root Cause (vorab, da kritisch)

Der Live-Prompt in `supabase/functions/analyze-voice-patterns/index.ts` enthält harte Maximalgrenzen:
- `possiblePatterns: MAX 4`
- `painContextFindings: MAX 1`
- `fatigueContextFindings: LEER lassen`
- `medicationContextFindings: MAX 1`
- `recurringSequences: MAX 2`
- `openQuestions: MAX 1`
- `confidenceNotes: MAX 1`

Mein vorheriger Patch hat `_shared/analysisCore.ts` umgebaut — diese Datei wird aber **nicht** von der Edge-Function importiert. Die Live-Function nutzt einen eigenen Inline-Prompt, deshalb liefert das LLM weiter nur 2–3 Findings.

Zusätzlich fehlt im Edge-Function-Kontext jegliche deterministische Pre-Analyse (Wetter-Druckabfälle, Tagesfaktoren-Signale, Medikamenten-Timing). Das Frontend reicht zwar Wetter-/Zeitaggregate mit, aber das LLM ignoriert sie wegen des restriktiven Prompts.

Drittens hat die UI keine festen Sektionen — wenn das LLM eine Kategorie leer lässt, wird die Sektion komplett unterdrückt statt „kein Muster" zu zeigen.

## Änderungen

### 1. Edge-Function-Prompt + Schema (`supabase/functions/analyze-voice-patterns/index.ts`)

- Prompt komplett ersetzen: aus „MAX X" werden **Pflichtsektionen** mit Mindestmengen oder klarer Nichtverfügbarkeit:
  - `possiblePatterns`: 2–4 Hauptmuster (`evidenceStrength` medium/high) plus 4–8 schwache Hinweise (`evidenceStrength=low`).
  - `painContextFindings`: bis zu 4.
  - `fatigueContextFindings`: bis zu 4 ODER 1 expliziter „nicht ausreichend dokumentiert"-Eintrag.
  - `medicationContextFindings`: bis zu 4.
  - `recurringSequences`: bis zu 4 (Triviales weiter verbieten).
  - `openQuestions`: bis zu 3.
  - `confidenceNotes`: 2–4 Pflicht (Datenqualitätsnotizen, inkl. Wetter-/Zeit-/MECFS-Abdeckung).
- Pflichtsektion-Klausel im Prompt: jede Kategorie MUSS bearbeitet werden; bei fehlenden Daten kurzer Eintrag „Keine Wetterdaten" / „Zeitmuster nicht erkennbar".
- `analysisVersion`-Bump im Response auf `1.1.1` (damit Cache mit altem Inhalt sicher invalidiert).
- Logging erweitern: counts aller Arrays nach Extraction.

### 2. Deterministische Pre-Analyse (`src/lib/voice/analysisEngine.ts`)

Erweiterung des bereits vorhandenen Enrichment-Blocks vor dem LLM-Call:

- **Wetter-Korrelation (deterministisch):**
  - Tage mit Δp24h ≤ −3 hPa: Schmerz-Trefferquote vs. Tage ohne Druckabfall.
  - Tage mit Δp24h ≥ +3 hPa: dito.
  - Temperaturbereich, Tage mit großen Temperatursprüngen (≥ 8 °C über 24h, falls aus Daten ableitbar).
- **Tagesfaktoren-Coverage:** Anzahl Tage mit `energy`/`fatigue_context_tags`/Stimmung/Schlaf-Werten.
- **Medikamenten-Timing:** Anzahl Triptan-Einnahmen relativ zu Schmerz ≥ 7, Vor-/Nach-Schmerzbeginn-Zähler, Anzahl Einträge ohne Medikation trotz Schmerz ≥ 7.
- Alle Aussagen mit Hedge-Wörtern („Hinweis", „möglicherweise", „nicht ausreichend").
- Block heisst `=== Deterministische Vorab-Auswertung ===` und wird vor `=== Wetterdaten ===` eingefügt.

Diese Pre-Analyse wird zusätzlich als strukturiertes Objekt im Response-Result gespeichert (`_preAnalysis`), damit das UI sie als Fallback rendern kann.

### 3. UI: Sektionsbasiertes Rendering mit Fallbacks (`src/components/PainApp/MigrainePatternAnalysis.tsx`)

Restrukturierung des Berichtsbereichs in feste Sektionen:

```text
1. Einordnung (summary)
2. Auffälligste Hinweise (possiblePatterns mit evidenceStrength medium/high)
3. Weitere mögliche Zusammenhänge (possiblePatterns low)
4. Wetter & Umwelt
5. Zeitmuster
6. ME/CFS & Energie
7. Medikamente
8. Datenqualität (immer sichtbar)
9. Was unklar bleibt (openQuestions)
```

Pro Sektion:
- LLM-Findings werden gefiltert/dedupliziert und gerendert.
- Wenn LLM nichts liefert → Fallback aus `_preAnalysis` deterministisch rendern (Wetter-/Zeitaggregat in lesbarer Form).
- Wenn auch Pre-Analyse keine relevanten Daten hat → klarer Text „Kein klares Muster erkennbar" oder „Daten nicht ausreichend".

Die Datenqualitätssektion zeigt: Anzahl Schmerztage, Wetter-Tage abgedeckt vs. Range, Tagesfaktoren-Tage abgedeckt vs. Range, ME/CFS-Tage.

### 4. Cache-Versionsbump (`src/lib/voice/analysisCache.ts`)

`ANALYSIS_VERSION = '1.1.1'` (war `1.1.0`). Damit invalidieren alle bestehenden Caches automatisch und werden im UI als „Analyse-Logik aktualisiert" markiert.

### 5. Tests

Neu in `src/lib/voice/__tests__/`:
- `analysisEngine.preAnalysis.test.ts` — Unit-Tests für Wetter-Druckabfall-Vergleich, Zeitaggregat, Tagesfaktoren-Coverage.
- `analysisCache.test.ts` — bestehende Tests anpassen (MAX_PATTERNS=8/MAX_SEQUENCES=4 sind bereits gesetzt, aber 5 Tests assertieren noch alte Limits → nachziehen).
- UI-Smoke-Test (optional, niedrige Priorität): Rendering aller Sektionen mit leerem LLM-Result + gefülltem `_preAnalysis`.

## Was du danach tust

Einmal „Erneut analysieren" klicken. Der Cache invalidiert wegen Versionsbump → neue Analyse mit erweitertem Prompt + Pre-Analyse-Kontext → UI zeigt alle 9 Sektionen, mit Pre-Analyse-Fallbacks falls das LLM einzelne Bereiche knapp lässt.

## Out of Scope

- Schmerzkalender-Format-Änderungen.
- PDF/Doctor-Share-Rendering (gleiches Schema, profitiert automatisch sobald App-Rendering steht — separate Iteration falls gewünscht).
- Zusätzliche LLM-Modellwechsel.
