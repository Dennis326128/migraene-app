

# Analyse und Behebung: Veraltete Startseite trotz Hard Refresh

## Problemanalyse: 5 identifizierte Ursachen

### Ursache 1: `build-id.txt` wird nie aktualisiert
Die Datei `public/build-id.txt` enthalt den statischen Wert `2026-02-18-01`. Sie wird bei Deployments **nicht automatisch generiert**. Der gesamte Version-Check in `checkForNewVersionAndReload()` ist daher wirkungslos -- er vergleicht immer denselben Wert.

### Ursache 2: Service Worker cached `index.html` und liefert alte Version
Die Workbox-Konfiguration nutzt:
- `navigateFallback: '/index.html'` -- jede Navigation wird aus dem Cache bedient
- `globPatterns: ['**/*.{js,css,html,...}']` -- `index.html` wird precached

Das bedeutet: Selbst bei Hard Refresh (Ctrl+Shift+R) umgeht der Browser zwar den HTTP-Cache, aber der **Service Worker sitzt davor** und liefert die alte `index.html` aus dem Precache. Hard Refresh kann einen aktiven Service Worker nicht umgehen.

### Ursache 3: Race Condition bei `forceClearCachesAndReload()`
Die Funktion macht:
1. `caches.delete()` -- loscht SW-Caches
2. `navigator.serviceWorker.unregister()` -- deregistriert SW
3. `location.reload()` -- ladt Seite neu

Problem: Zwischen Schritt 2 und 3 ist der alte SW moglicherweise noch aktiv (Unregistrierung ist async und betrifft erst den nachsten Seitenaufruf). Der Reload holt sich daher die Seite **erneut vom alten SW**.

### Ursache 4: `APP_VERSION` nur bei manuellen Bumps wirksam
`APP_VERSION = '4.6.0'` in `version.ts` wird nur manuell erhoht. Zwischen Version-Bumps erkennt `checkAppVersion()` keine Anderungen -- egal wie viel Code sich geandert hat.

### Ursache 5: `VITE_BUILD_ID` Umgebungsvariable fehlt
```typescript
export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';
```
Diese Variable wird nirgends gesetzt, daher ist BUILD_ID immer `'dev'`.

## Losungsplan

### Schritt 1: Build-Zeitstempel automatisch generieren

Statt der statischen `build-id.txt` und manuellen `APP_VERSION` wird bei jedem Build automatisch eine eindeutige Build-ID erzeugt.

**Datei: `vite.config.ts`**
- `VITE_BUILD_ID` als `define`-Wert mit Timestamp + Random-Hash setzen
- Beispiel: `'__BUILD_ID__': JSON.stringify(Date.now().toString(36))`

**Datei: `src/lib/version.ts`**
- `APP_VERSION` durch die automatische Build-ID ersetzen
- `checkAppVersion()` vergleicht nun immer den tatsachlichen Build

### Schritt 2: `index.html` aus dem Precache ausschliessen

**Datei: `vite.config.ts` -- Workbox-Konfiguration**

```text
Vorher:
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}']
  navigateFallback: '/index.html'

Nachher:
  globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}']  // html entfernt
  navigateFallback: undefined                               // entfernt
  runtimeCaching: [
    {
      urlPattern: /\/$/,                    // Navigation requests
      handler: 'NetworkFirst',              // Netzwerk zuerst, Cache als Fallback
      options: {
        cacheName: 'html-cache',
        networkTimeoutSeconds: 3,
        expiration: { maxAgeSeconds: 86400 }
      }
    },
    ... bestehende Regeln
  ]
```

Effekt: `index.html` wird **immer vom Netzwerk geholt** (mit 3s Timeout-Fallback auf Cache fur Offline). JS/CSS-Bundles bleiben precached (sie haben Hashes im Dateinamen und sind daher versioniert).

### Schritt 3: `navigateFallbackDenylist` erweitern

**Datei: `vite.config.ts`**

`/~oauth` zur Denylist hinzufugen (PWA-Pflicht laut Plattform-Docs):

```text
navigateFallbackDenylist: [
  /^\/api\//,
  /^\/auth\/callback/,
  /^\/~oauth/,
]
```

### Schritt 4: `forceClearCachesAndReload()` reparieren

**Datei: `src/lib/version.ts`**

Das Problem: `location.reload()` nach SW-Unregister holt die Seite noch vom alten SW.

Losung: Nach Unregister und Cache-Clear eine **echte Navigation** erzwingen statt `location.reload()`:

```text
// Statt location.reload():
window.location.href = window.location.href.split('#')[0] + '?_v=' + Date.now();
```

Oder besser: Den Reload mit einem Microtask-Delay ausfuhren, damit der SW-Unregister wirksam wird:

```text
// 1. Unregister all SWs
// 2. Clear all caches
// 3. Wait for next microtask (SW cleanup completes)
await new Promise(r => setTimeout(r, 100));
// 4. Navigate with cache-bust parameter
window.location.replace(window.location.pathname + '?_cb=' + Date.now());
```

### Schritt 5: Version-Check vereinfachen und robuster machen

**Datei: `src/lib/version.ts`**

Die gesamte Datei wird vereinfacht:

- `BUILD_ID` kommt jetzt automatisch aus dem Build (Schritt 1)
- `checkAppVersion()` vergleicht `BUILD_ID` gegen `localStorage`
- `checkForNewVersionAndReload()` (fetch auf `build-id.txt`) wird **entfernt** -- uberflussig, da die Build-ID direkt im JS eingebettet ist
- `initVersionWatcher()` behalt nur den `controllerchange`-Listener und den Visibility-Check

### Schritt 6: `usePWAUpdate` Hook bereinigen

**Datei: `src/hooks/usePWAUpdate.ts`**

- Polling-Intervall von 30s auf 60s erhohen (30s ist aggressiv und unnoetig)
- Sicherstellen, dass `onNeedRefresh` den Reload auch wirklich auslost (aktuell nur Log)

### Schritt 7: `build-id.txt` entfernen oder automatisch generieren

**Datei: `public/build-id.txt`**

Option A (bevorzugt): Datei entfernen, da nicht mehr benotigt (Build-ID ist im JS eingebettet).

Option B: Via Vite-Plugin bei jedem Build automatisch generieren (fur externe Monitoring-Tools).

## Zusammenfassung der Anderungen

| Datei | Anderung |
|---|---|
| `vite.config.ts` | Build-ID auto-generieren, `html` aus Precache entfernen, `navigateFallback` entfernen, NetworkFirst fur HTML, `/~oauth` in Denylist |
| `src/lib/version.ts` | `forceClearCachesAndReload` mit echtem Cache-Bust-Redirect, `checkForNewVersionAndReload` entfernen, Build-ID aus Compile-Time-Konstante |
| `src/hooks/usePWAUpdate.ts` | Polling-Intervall anpassen |
| `src/main.tsx` | Vereinfachter Boot (kein `build-id.txt` Fetch mehr) |
| `public/build-id.txt` | Entfernen oder auto-generieren |

## Warum das Problem damit dauerhaft gelost ist

1. **Jeder Build hat eine eindeutige ID** -- keine manuellen Bumps mehr notig
2. **`index.html` wird nie aus dem Precache bedient** -- NetworkFirst garantiert frische HTML
3. **JS/CSS haben Hashes** -- automatisch versioniert durch Vite
4. **Reload umgeht den SW zuverlassig** -- Cache-Bust-Parameter + Delay
5. **Kein externer Datei-Fetch mehr** -- Build-ID ist compile-time eingebettet

