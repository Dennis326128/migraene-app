# Native App Assets (iOS / Android)

Quellen für `@capacitor/assets`:

- `icon.png` — 1024×1024, App-Icon (Miary-Logo, dunkler Hintergrund)
- `splash.png` / `splash-dark.png` — 2732×2732, zentriertes Logo auf `#14171f`

## Native Assets generieren

Nach `git pull` lokal ausführen:

```bash
npm i -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor "#14171f" --iconBackgroundColorDark "#14171f" --splashBackgroundColor "#14171f" --splashBackgroundColorDark "#14171f"
npx cap sync
```

Erzeugt automatisch alle iOS/Android Icon- und Splash-Größen.
