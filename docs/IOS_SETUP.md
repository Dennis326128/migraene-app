# iOS App Setup mit Capacitor

Diese Anleitung beschreibt, wie du die Migraina Web-App als native iOS-App baust und im App Store veröffentlichen kannst.

## Voraussetzungen

- **macOS** mit Xcode 15+ installiert
- **Node.js** 18+ 
- **Apple Developer Account** (für App Store Veröffentlichung)
- Git Repository geklont

## 1. Projekt vorbereiten

```bash
# Repository klonen (falls noch nicht geschehen)
git clone <your-repo-url>
cd migraene-app

# Dependencies installieren
npm install
```

## 2. Web-App bauen

```bash
# Production Build erstellen
npm run build
```

Dies erstellt den `dist/` Ordner, den Capacitor für die iOS-App verwendet.

## 3. iOS Projekt erstellen

```bash
# iOS Plattform hinzufügen (nur beim ersten Mal)
npx cap add ios

# Web-Assets synchronisieren
npx cap sync ios
```

## 4. iOS Projekt in Xcode öffnen

```bash
npx cap open ios
```

## 5. iOS Permissions konfigurieren

In Xcode: **App > Info** oder direkt in `ios/App/App/Info.plist`:

Die folgenden Einträge müssen hinzugefügt werden:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Das Mikrofon wird für die Spracheingabe verwendet, um Einträge schneller zu erfassen.</string>

<key>NSSpeechRecognitionUsageDescription</key>
<string>Die Spracherkennung wird genutzt, um gesprochene Eingaben in Text umzuwandeln.</string>
```

## 6. Signing & Capabilities in Xcode

1. Wähle das **App** Target
2. Unter **Signing & Capabilities**:
   - Team: Dein Apple Developer Team auswählen
   - Bundle Identifier: `de.migraina.app` (muss mit capacitor.config.ts übereinstimmen)
   - Signing Certificate: "Automatically manage signing" aktivieren

## 7. App auf Simulator testen

1. In Xcode: Zielgerät auswählen (z.B. "iPhone 15 Pro")
2. ▶️ Run klicken oder `Cmd + R`

## 8. App auf echtem iPhone testen

1. iPhone mit USB verbinden
2. Dem Computer vertrauen (auf dem iPhone)
3. In Xcode: Dein iPhone als Zielgerät auswählen
4. ▶️ Run klicken

**Hinweis:** Für Entwicklung auf echten Geräten brauchst du mindestens einen kostenlosen Apple Developer Account.

---

## Standard-Workflow nach Code-Änderungen

```bash
# 1. Web-App neu bauen
npm run build

# 2. Änderungen zu iOS synchronisieren
npx cap sync ios

# 3. In Xcode öffnen und testen
npx cap open ios
```

## Entwicklungs-Modus mit Hot-Reload

Für schnelleres Entwickeln kannst du die Live-Vorschau nutzen:

1. In `capacitor.config.ts` den `server`-Block einkommentieren:
```typescript
server: {
  url: 'https://cbe03472-b138-40c1-9796-1c21073e1d39.lovableproject.com?forceHideBadge=true',
  cleartext: true
}
```

2. `npx cap sync ios` ausführen
3. App in Xcode starten

**Wichtig:** Für Production/App Store muss der `server`-Block auskommentiert bleiben!

---

## Bekannte Hinweise

### Safe Area / Notch
Die App verwendet `viewport-fit=cover` und CSS Safe Area Insets. Das Layout passt sich automatisch an iPhones mit Notch/Dynamic Island an.

### Statusbar
Die Statusbar ist auf Dark Mode eingestellt (helle Icons auf dunklem Hintergrund), passend zum App-Design.

### Splash Screen
- Hintergrundfarbe: #1C1C1E (App Dark Background)
- Dauer: 2 Sekunden
- Kein Spinner

---

## Nächste Schritte (App Store)

Diese Dokumentation behandelt nur das technische Setup. Für die App Store Veröffentlichung sind zusätzlich erforderlich:

1. **App Store Connect** Account und App-Eintrag
2. **App Icons** in allen erforderlichen Größen
3. **Screenshots** für verschiedene Gerätegrößen
4. **App-Beschreibung**, Keywords, Datenschutzerklärung
5. **TestFlight** für Beta-Tests
6. **App Review** Einreichung

Diese Schritte werden in einer separaten Anleitung behandelt.

---

## Troubleshooting

### White Screen beim App-Start
- Prüfe ob `npm run build` erfolgreich war
- Prüfe ob `npx cap sync ios` ausgeführt wurde
- In Xcode: Clean Build (`Cmd + Shift + K`) und erneut bauen

### Signing-Fehler
- Stelle sicher, dass du ein gültiges Apple Developer Team ausgewählt hast
- Bundle Identifier muss einzigartig sein

### Web-App lädt nicht
- Prüfe die Konsole in Xcode für Fehlermeldungen
- Für Development: Server-URL in capacitor.config.ts korrekt?
- Für Production: Server-Block auskommentiert?
