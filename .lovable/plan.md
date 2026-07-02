
## Ziel

Die Seite **Datenschutz & Konto** (Einstellungen → Datenschutz) modernisieren und sicherstellen, dass die verlinkte Datenschutzerklärung dem aktuellen Stand (April 2026, live unter `https://miary.de/datenschutz`) entspricht.

## Beobachtungen

- Die In-App-Datenschutzerklärung (`src/pages/PrivacyPolicy.tsx`) steht auf „Dezember 2025 / Version 1.1", während die offizielle Website-Version auf **April 2026** aktualisiert ist. Zwei Quellen für dasselbe Dokument = Wartungsrisiko.
- Die Karten „Gesundheitsdaten-Verarbeitung", „AGB & Datenschutzerklärung" und „Medizinischer Hinweis" tragen jeweils eigene Umrandungen innerhalb der Card (`border rounded-lg p-4`) → das ergibt die vom Nutzer bemängelten „Flächen mit weißen Rändern" auf dunklem Hintergrund.
- Jede dieser Karten zeigt zusätzlich ein grünes Badge „✓ Akzeptiert" / „✓ Aktiv" — vom Nutzer unerwünscht.

## Änderungen

### 1. Datenschutz-Link auf offizielle Website umstellen
- `src/components/ui/legal-links.tsx`: Eintrag „Datenschutz" verweist auf `https://miary.de/datenschutz` und öffnet extern (statt interner Route `/privacy`). AGB und Impressum bleiben unverändert (bzw. analog prüfbar, aber nicht Teil dieses Auftrags).
- Die interne Route `/privacy` bleibt erhalten (Fallback / SEO), wird aber aus der Settings-Oberfläche nicht mehr prominent verlinkt.

### 2. Redesign `ConsentManagementSection`
Datei: `src/features/consent/components/ConsentManagementSection.tsx`

- **Innere Kartenrahmen entfernen**: statt `border rounded-lg p-4`-Blöcken → schlichte, durch feine `divide-y divide-border/40`-Linien getrennte Zeilen innerhalb der äußeren Card. Kein doppeltes Framing mehr.
- **„Akzeptiert"-Badges entfernen** bei „AGB & Datenschutzerklärung" und „Medizinischer Hinweis". Diese Zustimmungen sind Voraussetzung für die App-Nutzung → keine Info-Wert, nur visuelles Rauschen.
- **Status „Gesundheitsdaten"**: Badge „Aktiv / Widerrufen" wird zu einem dezenten farbigen Punkt + Text (kein Pill mit Rand). Bei „Widerrufen" bleibt der destruktive Farbakzent.
- **Metadaten** (Erteilt am, Version, akzeptiert am) rücken in kleinere `text-xs text-muted-foreground`-Zeile, kompakter.
- **Widerrufen-Button** bleibt funktional, wird aber als schlichter Text-Button (`variant="ghost"` mit destruktivem Text) statt umrandetem Outline-Button gestaltet.
- **Tipp-Box** („Daten vor Widerruf exportieren") verliert die eigene Hintergrundfläche; wird zu einer schlanken Info-Zeile mit Icon + Text.

### 3. Redesign `SettingsPrivacy` (Rahmen-Konsistenz)
Datei: `src/components/PainApp/Settings/SettingsPrivacy.tsx`

- „Rechtliche Dokumente"-Buttons: statt `variant="outline"` (weißer Rand) → `variant="ghost"` mit `justify-between` und Chevron-Icon, getrennt durch feine Divider. Passt zum neuen ruhigeren Look.
- „Medizinischer Hinweis"-Button erhält die gleiche Behandlung.
- Die äußeren `Card`-Container bleiben als semantische Gruppierung erhalten (sie sind die einzige Umrandung, die der Nutzer sieht).

## Technische Details

- Keine Änderungen an API, Hooks oder Datenbank. Rein visuell.
- `LegalLinks.buttons`-Variante: der „Datenschutz"-Button erkennt externe URLs (`href.startsWith('http')`) und öffnet via `window.open` in neuem Tab; bestehende interne Routen (`/terms`, `/imprint`) bleiben `<Link>`.
- Keine Änderung an `ConsentGate`, `useConsent` oder Withdrawal-Flow.
- Dark-/Light-Mode: nur semantische Tokens (`border-border/40`, `text-muted-foreground`, `text-destructive`).

## Nicht Teil dieses Plans

- Umschreiben der In-App-Datenschutzerklärung auf April-2026-Stand (kann in Folge-Task erfolgen; da nun extern verlinkt wird, ist die interne Seite entkoppelt).
- Änderungen am AI-Consent-Toggle oder Account-Löschen-Bereich.
