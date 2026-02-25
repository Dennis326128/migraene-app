

# Fix: Veraltete Version wird angezeigt -- endgueltige Loesung

## Problemanalyse

Das Problem tritt wiederholt auf, weil die aktuelle Architektur mehrere Schwachstellen hat:

1. **Service Worker cached alte JS-Bundles**: Auch mit `NetworkFirst` fuer HTML kann der SW alte JS-Chunks aus dem Precache liefern, wenn der neue SW noch nicht aktiviert ist.
2. **`controllerchange`-Reload hat Race Conditions**: Zwischen SW-Unregister und Reload kann der alte SW noch aktiv sein.
3. **Kein aktiver Versions-Check gegen das Netzwerk**: `BUILD_ID` wird nur gegen `localStorage` geprueft -- wenn der alte JS-Code geladen wird, ist das alte `BUILD_ID` darin eingebettet, und der Vergleich ergibt "keine Aenderung".
4. **In der Lovable-Preview-Umgebung**: Builds passieren haeufig, aber der SW haelt alte Bundles fest.

## Loesung: Netzwerk-basierter Versions-Check (bulletproof)

Die einzige zuverlaessige Methode: **Eine kleine Datei vom Server holen (am SW vorbei), die die aktuelle Build-ID enthaelt, und mit der eingebetteten Build-ID vergleichen.**

### Schritt 1: `build-id.json` bei jedem Build automatisch generieren

**Datei: `vite.config.ts`**

Ein kleines Vite-Plugin hinzufuegen, das bei jedem Build eine Datei `dist/build-id.json` mit der aktuellen Build-ID schreibt. Zusaetzlich wird diese Datei explizit aus dem SW-Precache ausgeschlossen.

```text
// Plugin:
{
  name: 'generate-build-id',
  writeBundle() {
    fs.writeFileSync('dist/build-id.json', JSON.stringify({ id: buildId }));
  }
}

// Workbox: build-id.json in navigateFallbackDenylist + aus globPatterns ausgeschlossen
```

### Schritt 2: Aktiver Netzwerk-Versions-Check in `version.ts`

**Datei: `src/lib/version.ts`**

Neue Funktion `checkVersionFromNetwork()`:

- Fetched `/build-id.json` mit `cache: 'no-store'` (umgeht SW und HTTP-Cache komplett)
- Vergleicht die Server-Build-ID mit der eingebetteten `BUILD_ID`
- Bei Mismatch: `forceClearCachesAndReload()`

Wird aufgerufen:
- Einmalig 3 Sekunden nach App-Start (gibt dem Build Zeit, fertig zu werden)
- Bei `visibilitychange` (Tab wird wieder sichtbar)
- Alle 60 Sekunden als Fallback-Polling

### Schritt 3: SW darf `build-id.json` niemals cachen

**Datei: `vite.config.ts`**

In der Workbox-Konfiguration:
- `build-id.json` aus `globPatterns` ausschliessen (ist schon durch fehlende `.json`-Extension nicht drin, aber explizit sicherstellen)
- Eine `NetworkOnly`-Runtime-Caching-Regel fuer `/build-id.json` hinzufuegen

### Schritt 4: `initVersionWatcher()` erweitern

**Datei: `src/lib/version.ts`**

Die bestehende Funktion wird um den Netzwerk-Check ergaenzt:

```text
export function initVersionWatcher() {
  // 1. SW message listener (wie bisher)
  // 2. Netzwerk-Check nach 3s Delay
  setTimeout(checkVersionFromNetwork, 3000);
  // 3. Periodischer Check alle 60s
  setInterval(checkVersionFromNetwork, 60_000);
  // 4. Visibility-Change Check
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkVersionFromNetwork();
    }
  });
}
```

### Schritt 5: Robusterer `forceClearCachesAndReload()`

Kleine Verbesserung: Nach dem Unregister des SW einen laengeren Delay (300ms statt 100ms) einbauen, damit der SW wirklich deaktiviert ist, bevor der Redirect passiert.

## Zusammenfassung der Aenderungen

| Datei | Aenderung |
|---|---|
| `vite.config.ts` | Vite-Plugin: `build-id.json` bei jedem Build generieren; Workbox: `NetworkOnly` fuer `build-id.json` |
| `src/lib/version.ts` | `checkVersionFromNetwork()` hinzufuegen; `initVersionWatcher()` erweitern mit Polling + Visibility-Check; Delay in `forceClearCachesAndReload` erhoehen |

## Warum das diesmal endgueltig funktioniert

- **Netzwerk-Fetch mit `cache: 'no-store'`** umgeht sowohl den SW als auch den HTTP-Cache -- es gibt keinen Weg, eine alte Antwort zu bekommen.
- **Vergleich Server-ID vs. eingebettete ID** erkennt Mismatches zuverlaessig, egal welcher alte JS-Code gerade laeuft.
- **Mehrfache Check-Zeitpunkte** (Start, Polling, Tab-Wechsel) stellen sicher, dass ein Update spaetestens nach 60 Sekunden erkannt wird.
- **`build-id.json` wird automatisch generiert** -- kein manueller Schritt, kein Vergessen.

