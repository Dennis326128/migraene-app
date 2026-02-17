
# Redesign: "Erinnerung bearbeiten" -- Appointment-Hinweise

## Zusammenfassung

Die Ansicht fuer Termin-Erinnerungen wird visuell vereinheitlicht: Der "Folgetermin vorschlagen"-Bereich wird entfernt, die Benachrichtigungs-Optionen werden als kompakte Miary-Chips statt verschachtelter Kacheln dargestellt, und doppelte Informationen (Mini-Tags) werden eliminiert.

## Was sich aendert

### 1. Entfernen

- **"Folgetermin vorschlagen"** (Zeilen 788-833): Der gesamte Block mit Toggle + Konfiguration wird aus der UI entfernt. Die Datenfelder (follow_up_enabled etc.) bleiben im Datenmodell erhalten, werden aber nicht mehr im Formular angezeigt/gesetzt.
- **Mini-Tags unterhalb der Chips** (Zeilen 894-911): Die Badge-Liste mit "X"-Buttons wird komplett entfernt. Keine doppelte Darstellung der Auswahl.
- **Erklaerungstext** "Waehle bis zu 4 Erinnerungszeitpunkte" wird ersetzt durch dezenten Helper-Text.

### 2. Notification-Optionen als Miary-Chips

Die aktuelle Collapsible-Box mit Checkbox-Kacheln (border + bg-primary/10 + Checkbox-Icon) wird ersetzt durch:

- **Immer sichtbar** (kein Collapsible mehr) -- direkt unter der Ueberschrift "Hinweise"
- **2-spaltiges Grid** mit kompakten Select-Chips
- **Chip-Design** identisch zum "Wie oft erinnern?"-Bereich (Zeilen 630-641):
  - Inaktiv: `bg-muted/50 text-foreground hover:bg-muted` mit dezenter Outline
  - Aktiv: `bg-primary text-primary-foreground`
  - Abgerundete Form (`rounded-lg`), kompaktes Padding (`px-3 py-2`)
  - Kein Checkbox-Icon, kein doppelter Rahmen
- **Max-4-Logik** bleibt: Bei Versuch einer 5. Auswahl erscheint dezenter Inline-Text: "Maximal 4 Zeitpunkte moeglich." (text-muted-foreground, kein Popup)

### 3. "Weiteren Termin anlegen"

- Wird von voller Breite `variant="outline"` zu einem dezenten Text-Button (`variant="ghost"`, kleinere Schrift) umgestaltet
- Optisch wie sekundaere Aktionen in anderen Screens

### 4. Vertikale Kompaktierung

- Spacing in den Abschnitten wird von `space-y-5` auf `space-y-4` reduziert
- Padding in bg-muted/30-Bloecken bleibt bei `p-4` (konsistent)

---

## Technische Details

### Datei: `src/components/Reminders/ReminderForm.tsx`

**A) Follow-up-Bereich entfernen (Zeilen 788-833)**
- Den gesamten `{isAppointmentType && (...)}` Block mit "Folgetermin vorschlagen" entfernen
- State-Variablen (`followUpEnabled`, `followUpValue`, `followUpUnit`, `seriesId`) und zugehoerige Submit-Logik bleiben vorerst, setzen aber Defaults (follow_up_enabled: false)

**B) Notification-Offsets neu gestalten (Zeilen 835-914)**
Ersetze den Collapsible-Block durch:

```text
<div className="space-y-3">
  <div>
    <Label className="text-base font-medium">Hinweise</Label>
    <p className="text-xs text-muted-foreground mt-0.5">
      Bis zu 4 Zeitpunkte auswaehlbar.
    </p>
  </div>
  <div className="grid grid-cols-2 gap-2">
    {NOTIFY_OFFSET_PRESETS.map(preset => {
      // Toggle-Chip im gleichen Stil wie "Wie oft erinnern?"
      // bg-primary + text-primary-foreground wenn aktiv
      // bg-muted/50 + text-foreground wenn inaktiv
      // Bei max 4 erreicht + nicht ausgewaehlt: opacity-50
    })}
  </div>
  {/* Inline-Hinweis nur wenn 4 erreicht */}
  {notifyOffsets.length >= 4 && (
    <p className="text-xs text-muted-foreground">
      Maximal 4 Zeitpunkte moeglich.
    </p>
  )}
</div>
```

**C) "Weiteren Termin anlegen" dezenter (Zeilen 917-928)**
```text
<Button variant="ghost" size="sm" className="text-muted-foreground">
  <CalendarPlus /> Weiteren Termin anlegen
</Button>
```

**D) Collapsible-State entfernen**
- `notifyOffsetsOpen` State und `setNotifyOffsetsOpen` werden nicht mehr benoetigt
- Imports von `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger`, `ChevronDown`, `Badge`, `Checkbox` koennen entfernt werden (sofern nicht anderweitig genutzt)

### Keine weiteren Dateien betroffen
- `attention.ts` (NOTIFY_OFFSET_PRESETS, formatNotifyOffsets) bleibt unveraendert
- Datenmodell/Types bleiben unveraendert
- Submit-Logik fuer `notify_offsets_minutes` bleibt funktional identisch
