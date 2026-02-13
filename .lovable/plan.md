
# Fix: Pie Chart zeigt falsche "schmerzfreie Tage" wegen 50-Entry-Limit

## Problem

Die DiaryReport-Ansicht laedt Eintraege ueber `useEntries({ from, to })`, welches intern `listEntries()` mit einem **Standard-Limit von 50** aufruft. Bei einem 3-Monats-Zeitraum mit z.B. 80+ Eintraegen werden nur die neuesten 50 geladen. Die restlichen Tage haben dann keine Eintraege und werden faelschlicherweise als "schmerzfrei" (gruen) klassifiziert.

**Beispiel**: 91 Tage Zeitraum, 80 Eintraege in DB, aber nur 50 geladen. Die aeltesten 30 Eintraege fehlen, deren Tage werden gruen gezaehlt statt orange/rot.

## Loesung

In `DiaryReport.tsx` wird `useEntries` durch `fetchAllEntriesForExport` ersetzt, das bereits existiert und alle Eintraege ohne Limit laedt (mit Batching fuer grosse Datensaetze).

## Aenderungen

### Datei: `src/components/PainApp/DiaryReport.tsx`

**Zeile 292 ersetzen**: Statt `useEntries({ from, to })` wird eine eigene `useQuery` mit `fetchAllEntriesForExport(from, to)` verwendet:

```typescript
// VORHER (fehlerhaft - nur 50 Eintraege):
const { data: entries = [], isLoading } = useEntries({ from, to });

// NACHHER (alle Eintraege im Zeitraum):
const { data: entries = [], isLoading } = useQuery({
  queryKey: ["allEntriesForReport", from, to],
  queryFn: () => fetchAllEntriesForExport(from, to),
  staleTime: 30_000,
  gcTime: 5 * 60_000,
});
```

Das ist die einzige Aenderung. `fetchAllEntriesForExport` existiert bereits, laedt in 1000er-Batches, und selektiert auch `entry_kind`. Alle nachgelagerten Berechnungen (dayBuckets, reportData, PDF) erhalten dann die vollstaendigen Daten.

### Keine weiteren Dateiaenderungen noetig

- `dayBuckets.ts` - Logik ist korrekt, bekommt nur mehr Daten
- `isPainEntry.ts` - unveraendert
- `entries.api.ts` - `fetchAllEntriesForExport` existiert bereits
- PDF-Export - nutzt bereits separat `fetchAllEntriesForExport`
