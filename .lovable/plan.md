## Ziel

Kalenderübersicht klarer lesbar machen:
1. Dokumentiert schmerzfrei (Pain = 0) → gleiches Grün wie im Pie-Chart der Schmerzverteilung (`hsl(142 76% 36%)` ≈ `#16a34a`). Aktuell wird Pain=0 nahezu transparent gerendert, deshalb sehen die schmerzfreien Tage im Screenshot noch grau/dunkel aus.
2. Tage ohne Eintrag → dezente diagonale Grau/Grün-Streifen (45°, ~22 % Grün-Opazität).
3. Legende ergänzt: grüner Marker „schmerzfrei" + gestreifter Marker „keine Einträge".

## Änderungen

**`src/features/diary/calendar/painColorScale.ts`**
- `PAIN_COLORS_HEX[0]` von `rgba(255,255,255,0.03)` auf `#16a34a` (Pie-SSOT `PIE_COLORS_CSS.painFree`).
- `getTextColorForPain(0)` liefert weiß (statt hellgrau), damit die „0" auf Grün lesbar bleibt.

**`src/features/diary/calendar/DayCell.tsx`**
- Neuer Zweig „kein Eintrag":
  - Background via inline `repeating-linear-gradient(45deg, hsl(var(--muted)/0.45) 0 4px, hsl(142 76% 36% / 0.22) 4px 8px)`.
  - Zukünftige Tage und Tage außerhalb des aktuellen Monats bleiben schlicht neutral (keine Streifen), damit die Streifen nicht als Zukunftsprognose gelesen werden.
- Text bleibt `text-muted-foreground`, Heute-Ring/Klick unverändert.

**`src/features/diary/calendar/CalendarLegend.tsx`**
- Zweite Zeile mit zwei kleinen Markern: grünes Quadrat („schmerzfrei"), gestreiftes Quadrat („keine Einträge"). Kompakt, kein Layout-Umbau.

## Nicht Teil des Plans

- Keine Änderung an Datenlogik, Cache, Realtime, Pie-Chart oder PDF.
- Kein Toggle — Streifen fest, aber dezent.

## Verifikation

- Playwright-Screenshot des aktuellen + Vormonats zur Sichtprüfung (Grün-Zellen + Streifen sichtbar, aber ruhig).
- Bestehende Kalender-Tests laufen unverändert weiter.
