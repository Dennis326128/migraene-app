# Konzept: Medikamenten- & Termin-Erinnerungen

## Analyse des Ist-Zustands

Die App besitzt bereits eine umfangreiche Reminder-Infrastruktur — das Konzept baut darauf auf, statt parallel zu starten.

**Vorhanden:**
- DB-Tabelle `reminders` (28 Spalten) inkl. `type`, `date_time`, `repeat`, `time_of_day`, `notification_enabled`, `medication_id`, `doctor_id`, `series_id`, `weekdays`, `status`, `snoozed_until`.
- Repeat-Typen aktuell: `none | daily | weekly | monthly | weekdays` → **monatlich ist bereits unterstützt** (relevant für Ajovy).
- UI: `RemindersPage`, `ReminderForm`, `ReminderCard`, `TimeOfDaySelector`, `ReminderTimePresets`.
- API/Hooks: `useReminders`, `useToggleMedicationReminder`, `useMedicationReminderStatus`.
- `MedicationEditModal` zeigt bereits eine Zeile „Erinnerung — Hinzufügen/Bearbeiten" (Z. 446–457), öffnet bisher aber keinen schlanken Flow.
- Push: Tabelle `push_subscriptions` + VAPID-Keys liegen vor, werden aber bewusst **nicht** angefasst.

**Lücken / Schwachpunkte:**
1. Kein einheitlicher, einfacher „Erinnerung anlegen" Flow direkt aus dem Medikamenten-Modal — heute springt der Nutzer auf die Reminders-Seite.
2. `ReminderForm` ist sehr umfangreich (Follow-up, Voice, Snooze, mehrere Tabs) — für die gewünschte „sehr einfache" UX zu viel.
3. Kein klarer „monatlich am X." Tag-Picker — `monthly` nutzt aktuell den Tag aus `date_time` implizit.
4. Aktivieren/Deaktivieren pro Reminder existiert (`notification_enabled`), ist im UI aber nicht prominent als Toggle sichtbar.
5. Für Termine fehlt ein eigener kompakter Einstieg außerhalb der vollen Reminders-Seite.

## Ziel-UX (mobil-first, App-Stil)

### A) Medikamenten-Erinnerung
Im `MedicationEditModal` wird die bestehende „Erinnerung"-Zeile zu einem inline **Bottom-Sheet** „Erinnerung einrichten":

```text
┌─────────────────────────────┐
│ Erinnerung aktiv      [ ⬤ ] │  ← Master-Toggle
├─────────────────────────────┤
│ Uhrzeit         08:00   ›   │  ← TimePresets + Custom
│ Wiederholung    Täglich ›   │  ← Chips: Einmalig · Täglich · Wöchentlich · Monatlich
│ Startdatum      Heute   ›   │
│ (bei wöchentlich) Wochentage│
│ (bei monatlich)  Am 15.     │
└─────────────────────────────┘
       [ Speichern ]
```

- **Smart Defaults aus Medikament:** Ajovy/CGRP → `monthly` vorausgewählt (über `detectImplicitFrequency`), Triptan → `none`, sonst `daily`.
- Toggle „Erinnerung aktiv" steuert `notification_enabled` UND legt beim ersten Einschalten den Reminder an.

### B) Termin-Erinnerung
Neuer Quick-Add-Button auf `RemindersPage` („+ Termin") öffnet ein schlankes Sheet mit denselben Bausteinen, plus optional Arzt-Verknüpfung (`doctor_id`).

### C) Übersicht / Aktivieren-Deaktivieren
`ReminderCard` bekommt einen sichtbaren Switch rechts oben (`notification_enabled`). Long-press / Trailing-Menü: Bearbeiten · Löschen.

## Wiederholungs-Logik

| UI-Label   | DB `repeat` | Verhalten |
|------------|-------------|-----------|
| Einmalig   | `none`      | Einmal zu `date_time` |
| Täglich    | `daily`     | jeden Tag zur Uhrzeit |
| Wöchentlich| `weekly`    | gewählte Wochentage (`weekdays[]`) |
| Monatlich  | `monthly`   | gleicher Tag jeden Monat (z. B. Ajovy alle 30 Tage → siehe Hinweis) |

**Hinweis Ajovy:** medizinisch alle 28–30 Tage. Wir bleiben bei `monthly` (gleicher Kalendertag) als einfachster Default. Eine spätere Erweiterung „alle N Tage" wird vorgemerkt, ist aber nicht Teil dieses Schrittes.

## Umsetzungsplan (Reihenfolge)

1. **Neue Komponente** `src/components/Reminders/SimpleReminderSheet.tsx`
   - Props: `medicationId?`, `appointment?: boolean`, `initial?: Partial<Reminder>`, `onSaved`.
   - Felder: Master-Toggle, Zeit, Wiederholungs-Chips, Datum, kontextuelle Wochentage/Monatstag.
   - Nutzt vorhandene `useCreateReminder` / `useUpdateReminder` / `useDeleteReminder`.

2. **MedicationEditModal** (`src/components/PainApp/MedicationEditModal.tsx`)
   - Bestehende Zeile (Z. 446–457) öffnet `SimpleReminderSheet` statt Navigation.
   - Default-Wiederholung aus `detectImplicitFrequency(med)`.

3. **RemindersPage**
   - Quick-Action „+ Termin" öffnet `SimpleReminderSheet` im Appointment-Modus.
   - `ReminderCard` bekommt sichtbaren Aktiv-Switch → `useToggleMedicationReminder` / direkter Update-Hook.

4. **Typen / API** — keine Schema-Änderung nötig, alles bereits vorhanden (`repeat: 'monthly'`, `notification_enabled`, `weekdays`).

5. **Keine Push-Logik** — `notification_channels`/Service-Worker bleiben unverändert. In-App-Banner (`UpcomingWarningBanner`) zeigt fällige Reminder weiterhin.

## Offene Entscheidungen für dich

1. **Monatlich für Ajovy:** „gleicher Kalendertag" reicht zunächst, oder schon jetzt „alle 28 Tage" als zweite Option?
2. **Mehrere Uhrzeiten pro Tag** (z. B. 3× täglich Ibuprofen): in diesem Schritt **nicht** geplant — heutige Lösung: mehrere Reminder. OK?
3. **Termin-Quick-Add** auch im Hauptmenü/FAB sichtbar, oder ausschließlich auf der Reminders-Seite?

## Out of Scope
- Push-Benachrichtigungen / Service-Worker-Trigger.
- Snooze-Refactor, Voice-Reminder, Follow-up-Logik (bleiben unverändert).
- DB-Migration.
