# Native App Assets (iOS / Android)

Quellen für `@capacitor/assets`:

- `icon.png` — 1024×1024, App-Icon (Miary-Logo)
- `splash.png` / `splash-dark.png` — 2732×2732, zentriertes Logo (~34 % Fläche) auf `#14171C` (= App-`--background` `hsl(220 13% 9%)`)

Splash ist statisch, ohne Spinner, ohne Text, ohne Animation — entspricht den Anforderungen für migränesensible Nutzer.

## Native Assets generieren

Nach `git pull` lokal ausführen:

```bash
npm i -D @capacitor/assets
npx capacitor-assets generate \
  --iconBackgroundColor "#14171C" --iconBackgroundColorDark "#14171C" \
  --splashBackgroundColor "#14171C" --splashBackgroundColorDark "#14171C"
npx cap sync
```

Erzeugt automatisch alle iOS/Android Icon- und Splash-Größen aus den beiden Quellbildern.
