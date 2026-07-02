## Ziel
Die Kalenderübersicht (`CalendarView` / `useCalendarPainSummary`) soll immer den aktuellen Datenstand zeigen — ohne dass der Nutzer 5 Minuten warten oder die Seite neu laden muss.

## Ist-Zustand (kurz analysiert)
- Kalender-Hook nutzt eigene Query-Keys:
  - `['calendar-entries', from, to]` (staleTime 5 Min)
  - `['first-entry-date']` (staleTime 10 Min)
- Alle Mutationen (Anlegen/Bearbeiten/Löschen von Einträgen, Voice-Einträge, Medikamenten-Intakes, Medikamenten-Effekte) invalidieren nur `["entries"]`, `["missing-weather"]`, `["unratedMedicationEntries"]` etc.
- **Die Calendar-Keys werden nirgends invalidiert** → Kalender bleibt bis zu 5 Min veraltet, oder bis Hard-Reload.
- Kein `refetchOnWindowFocus`, keine Realtime-Subscription.

## Lösung (minimal-invasiv, mehrschichtig)

### 1. Zentraler Invalidierungs-Helfer
Neue Datei `src/features/entries/hooks/invalidateEntryCaches.ts`:
- Exportiert `invalidateEntryCaches(qc)`, das **alle** von Einträgen abhängigen Query-Keys invalidiert:
  - `["entries"]`
  - `["calendar-entries"]`
  - `["first-entry-date"]`
  - `["pain-entries-count"]`
  - `["missing-weather"]`
  - `["filtered-entries"]`, `["allEntriesForReport"]`, `["entriesCount"]`
- Ein Aufruf statt 3–4 einzelne. Verhindert Vergessen künftig.

### 2. Alle Mutations-Callsites auf Helfer umstellen
Betrifft:
- `src/features/entries/hooks/useEntryMutations.ts` (create/update/delete)
- `src/features/medication-intakes/hooks/useMedicationIntakes.ts` (4 Stellen)
- `src/features/medication-effects/hooks/useMedicationEffects.ts` (Rate/Update/Delete)
- Voice-Eintrags-Speicherpfade in `DiaryTimeline.tsx` (dort wo neue Entries geschrieben werden)

### 3. Kalender-Query „frischer" machen
In `useCalendarPainSummary.ts`:
- `staleTime` von 5 Min auf **30 Sek** senken (bleibt effizient, aber gefühlt „immer aktuell").
- `refetchOnWindowFocus: true` (App-Tab wieder aktiv → automatischer Refresh).
- `refetchOnMount: 'always'` beim Öffnen der Kalender-Route.
- `first-entry-date` staleTime auf 2 Min senken.

### 4. Realtime-Auffrischung (optional, empfohlen)
In `CalendarView.tsx` (oder als eigener Hook `useCalendarRealtime`):
- Supabase-Channel auf `postgres_changes` für `pain_entries` (Filter: `user_id=eq.<auth.uid()>`).
- Bei INSERT/UPDATE/DELETE → `invalidateEntryCaches(qc)`.
- Sauber im `useEffect`-Cleanup `removeChannel` aufrufen (SSOT-Regel Realtime).
- Voraussetzung: `pain_entries` muss in `supabase_realtime` publication sein. Falls nicht → Migration `ALTER PUBLICATION supabase_realtime ADD TABLE public.pain_entries;` und `REPLICA IDENTITY FULL`.

### 5. Sichtbares „Aktualisieren"-Feedback (optional, klein)
- Beim aktiven Refetch dezent den bestehenden Loading-Indikator im Kalender-Header nutzen (nichts neu bauen).

## Technische Details
- Keine DB-Schema-Änderungen außer ggf. Realtime-Publication.
- Keine UI-Umbauten am Kalender selbst.
- Rückwärtskompatibel: alte `["entries"]`-Invalidations bleiben, der Helfer erweitert nur.
- Testabdeckung: kleiner Unit-Test für `invalidateEntryCaches` (Keys korrekt aufgerufen).

## Ergebnis
Nach einem neuen Eintrag (App, Voice, Import, Backfill) oder Bearbeiten/Löschen erscheint die Änderung im Kalender:
- **sofort**, wenn im gleichen Client (Invalidation),
- **innerhalb Sekunden**, wenn aus einem anderen Tab/Gerät (Realtime),
- **spätestens beim Tab-Fokus** (refetchOnWindowFocus).
