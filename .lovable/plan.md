# Verlauf-Liste nach dokumentiertem Zeitpunkt sortieren

## Problem
Im Tab „Medikamente → Verlauf" werden die Einnahmen aktuell nach der DB-Spalte `taken_at` sortiert. Bei nachträglich dokumentierten Einnahmen ist `taken_at` aber faktisch der Eintrag-Zeitpunkt – nicht der dokumentierte Einnahmezeitpunkt. Folge (siehe Screenshot): „Mi 3. Juni 22:39" steht über „Do 4. Juni 18:03".

In der UI wird bereits korrekt `taken_date` + `taken_time` als „dokumentierter Zeitpunkt" angezeigt – nur die Sortierung passt nicht dazu.

## Lösung
Die Liste nach `taken_date DESC, taken_time DESC` sortieren – also exakt nach dem, was die UI auch anzeigt. `taken_at` bleibt unangetastet (wird weiter für Counts/Zeitstempel benutzt).

## Betroffene Stelle
`src/features/medication-intakes/api/medicationHistory.api.ts`
- `getMedicationHistory(...)` → `.order("taken_at", { ascending: false })` ersetzen durch
  `.order("taken_date", { ascending: false }).order("taken_time", { ascending: false, nullsFirst: false })`
- `getMedicationHistoryLatest(...)` → identisch anpassen

## Nicht betroffen / bleibt gleich
- Keine DB-Migration.
- Keine Änderung an Counts (7d/30d), Limit-Logik, SSOT-Helpern oder Anzeige-Format.
- Keine Änderung an `taken_at` selbst.
- Keine UI-Komponenten-Änderungen – `MedicationHistoryView.tsx` rendert weiterhin aus `taken_date`/`taken_time`.

## Erwartetes Ergebnis
Reihenfolge entspricht exakt dem dokumentierten Zeitpunkt, z. B.:
- Do, 4. Juni – 18:03
- Mi, 3. Juni – 22:39
- Mi, 3. Juni – 14:04
- …
