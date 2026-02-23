# Miary Report V2 — SSOT Aggregation Library

## Ziel

Single Source of Truth für **alle** medizinischen Kennzahlen in Miary.
Wird verwendet von:

- **App UI** (Analyse-Dashboard)
- **PDF-Generator** (Kopfschmerztagebuch)
- **Supabase Edge Functions** (Doctor Web-Dashboard)

## Architektur-Regeln

1. **Keine DB-Calls.** Daten werden als Parameter übergeben.
2. **Keine Date-Bibliotheken.** `YYYY-MM-DD` sortiert lexikographisch.
3. **Keine Node-only APIs.** Kompatibel mit Browser + Deno.
4. **Reine Funktionen.** Kein State, keine Seiteneffekte.
5. **Zählregeln nur in `definitions.ts`.** Niemals woanders.

## TODO: totalDaysInRange

Aktuell wird `totalDaysInRange` aus der Anzahl distincter Tage in `entries` bestimmt.
Für korrekte Kalender-Range-Berechnung muss der **Caller** alle Tage im Zeitraum
als Entries liefern (undokumentierte Tage mit `documented: false`).

Alternativ: Upstream Date-Math mit `date-fns` und `totalDaysInRange` als expliziten
Parameter an `computeMiaryReport()` übergeben (geplant für Step 3B).

## Edge Function Import (Deno)

Für Supabase Edge Functions wird diese Library über den `_shared/` Ordner importiert:

```
supabase/functions/_shared/report-v2/
```

Die Dateien werden 1:1 kopiert oder via Symlink bereitgestellt.
Kein `npm`-Import in Deno — reine relative Imports.

## Dateien

| Datei | Zweck |
|---|---|
| `types.ts` | MiaryReportV2 Contract (Typen) |
| `definitions.ts` | Zählregeln (isHeadacheDay, MOH etc.) |
| `normalize.ts` | Input-Validierung & Defaults |
| `aggregate.ts` | Haupt-Aggregation → MiaryReportV2 |
| `kpis.ts` | KPI-Berechnung (intern) |
| `charts.ts` | Chart-Daten-Builder (intern) |
| `index.ts` | Public API Exports |
