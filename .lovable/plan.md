

# Plan: Korrektur Kuchendiagramm-Logik + Zukunftssicherung

## Analyse-Ergebnis (Fakten aus der DB)

Die Datenbank wurde geprüft:

- **336 Eintraege** existieren, **alle** haben ein gesetztes `pain_level` (Werte: 2-10, leicht, mittel, stark, sehr_stark)
- **0 Eintraege** mit `pain_level = '-'`, `null`, `'0'` oder leer
- Es gibt **kein separates "Alltag/Ausloser"-Formular**, das Eintraege ohne Schmerz in `pain_entries` speichert
- Voice-Eintraege haben ebenfalls immer ein `pain_level` gesetzt
- ContextTagsView extrahiert Tags aus den Notizen bestehender Schmerz-Eintraege

**Aktuelle Logik ist korrekt fuer die bestehenden Daten.** Das Problem tritt erst auf, wenn zukuenftig Nicht-Schmerz-Eintraege in `pain_entries` gespeichert werden.

## Was wird gemacht

### 1. Schema-Erweiterung: `pain_entries.entry_kind`

Neues TEXT-Feld `entry_kind` mit Default `'pain'`:

```text
Werte: 'pain' | 'lifestyle' | 'trigger' | 'voice' | 'note'
```

- Migration: `ALTER TABLE pain_entries ADD COLUMN entry_kind text NOT NULL DEFAULT 'pain'`
- Alle 336 bestehenden Eintraege erhalten automatisch `'pain'` (korrekt, da alle Schmerz-Eintraege sind)
- Kein Datenverlust, kein Breaking Change

### 2. `isPainEntry()` Utility erstellen

Datei: `src/lib/diary/isPainEntry.ts`

```text
Logik:
1. Wenn entry_kind vorhanden: return entry_kind === 'pain'
2. Fallback (Abwaertskompatibilitaet): pain_level existiert UND pain_level nicht in ['-', '0', '', null]
```

### 3. `dayBuckets.ts` aktualisieren

- `classifyDay()` nutzt `isPainEntry(entry)` statt der direkten `pain_level`-Pruefung
- Ergebnis: Zukuenftige Nicht-Schmerz-Eintraege werden korrekt als GRUEN klassifiziert

### 4. Create-Flows anpassen

Beim Speichern von Eintraegen `entry_kind` setzen:

| Flow | entry_kind |
|------|-----------|
| Schmerz-Eintrag (NewEntry) | `'pain'` |
| Schnell-Eintrag (QuickEntryModal) | `'pain'` |
| Voice mit Schmerz (entry_type='new_entry') | `'pain'` |
| Voice ohne Schmerz (entry_type='context_entry') | `'voice'` |

Da aktuell kein separates Alltag/Ausloser-Formular existiert, das in `pain_entries` schreibt, sind nur die bestehenden Flows relevant.

### 5. Zod-Schema erweitern

`EntryPayloadSchema` um optionales `entry_kind` Feld erweitern.

### 6. Keine UI/PDF-Aenderungen noetig

Die Pie-Chart-Komponenten (`HeadacheDaysPie.tsx`, `pieChart.ts`) und die Integration in DiaryReport/DoctorReportView/PDF bleiben unveraendert - sie nutzen bereits `computeDiaryDayBuckets()` als Single Source of Truth.

## Technische Details

### Dateien die erstellt werden:
- `src/lib/diary/isPainEntry.ts`

### Dateien die geaendert werden:
- `src/lib/diary/dayBuckets.ts` - `classifyDay()` nutzt `isPainEntry()`
- `src/lib/zod/schemas.ts` (oder `entrySchemas.ts`) - `entry_kind` Feld hinzufuegen
- `src/features/entries/api/entries.api.ts` - `entry_kind` im Insert setzen
- `src/components/PainApp/QuickEntryModal.tsx` - `entry_kind: 'pain'` setzen
- `src/components/PainApp/NewEntry.tsx` - `entry_kind` bei Voice-Context auf `'voice'` setzen

### DB-Migration:
```sql
ALTER TABLE pain_entries 
ADD COLUMN entry_kind text NOT NULL DEFAULT 'pain';
```

## Auswirkung

- Bestehende Daten: Keine Aenderung (alle 336 Eintraege = `'pain'`, korrekt)
- Bestehende Pie-Charts: Identische Zahlen wie bisher
- Zukunft: Wenn Nicht-Schmerz-Eintraege hinzugefuegt werden, werden diese korrekt als GRUEN klassifiziert

