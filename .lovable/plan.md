

## Problem: Veraltete UI wird angezeigt

### Diagnose

Ich habe die Architektur analysiert und **drei kritische Probleme** identifiziert:

1. **Build-ID nicht synchron**: Die `build-id.txt` auf der publizierten Seite (`migraene-app.lovable.app`) zeigt `2025-10-14-01`, während der Code auf `2026-02-01-01` aktualisiert wurde. Die Build-ID wird beim Publish nicht automatisch aktualisiert.

2. **Doppelte Service Worker Registrierung**: 
   - `vite-plugin-pwa` generiert einen Workbox-SW
   - `public/sw.js` ist ein manueller SW
   - `registerOfflineSupport()` in `useOptimizedCache.ts` registriert den manuellen SW
   - Diese konkurrieren und erzeugen unvorhersehbares Caching

3. **Version-Check hat Lücken**:
   - Check wird nur einmal ausgeführt (`hasCheckedOnce`)
   - Wenn SW alte Dateien liefert, hilft auch der Check nicht
   - `SKIP_WAITING` wird nur an den wartenden SW gesendet, aber nicht erzwungen

---

## Lösung: Aggressives Auto-Update System

### Schritt 1: Einheitlicher Service Worker

Den manuellen `public/sw.js` entfernen und vollständig auf `vite-plugin-pwa` setzen:

```text
Änderungen:
- public/sw.js löschen (oder umbenennen zu sw.legacy.js)
- vite.config.ts: registerType auf 'autoUpdate' ändern
- useOptimizedCache.ts: registerOfflineSupport() entfernen
```

### Schritt 2: Automatisches Hard-Reload bei neuer Version

Statt "Prompt" (User muss klicken) wird automatisch neu geladen, sobald keine Sync-Vorgänge laufen:

```text
src/lib/version.ts anpassen:
- Neuer Mechanismus: checkAndAutoReload()
- Prüft pending saves via getPendingCount()
- Wenn 0: Sofort reload
- Wenn > 0: Warte auf sync-complete, dann reload
- Fallback: Nach 30s Timeout trotzdem reload mit Warnung
```

### Schritt 3: Service Worker Controller Change Listener

Wenn ein neuer SW die Kontrolle übernimmt, sofort neu laden:

```typescript
// In main.tsx hinzufügen
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  window.location.reload();
});
```

### Schritt 4: Aggressiverer Version-Check

```text
src/lib/version.ts:
- hasCheckedOnce Variable entfernen
- Bei JEDEM Tab-Focus checken (kein 5-Min-Cooldown)
- Bei SW-Update-Event: Sofort forceClearCachesAndReload()
```

### Schritt 5: PWA Update Banner entfernen

Da wir auf Auto-Update setzen, brauchen wir kein manuelles Banner mehr.

---

## Technische Änderungen im Detail

### 1. vite.config.ts

```typescript
VitePWA({
  registerType: 'autoUpdate', // War 'prompt'
  // ...
  workbox: {
    skipWaiting: true,    // War false
    clientsClaim: true,   // War false
    // ...
  }
})
```

### 2. src/main.tsx

```typescript
// Am Ende von main.tsx hinzufügen:
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('🔄 New SW took control, reloading...');
    window.location.reload();
  });
}
```

### 3. src/lib/version.ts

```typescript
// Komplett überarbeitete Version:
// - Entfernt hasCheckedOnce
// - Prüft pending saves vor Reload
// - Aggressiverer Check-Rhythmus
```

### 4. Dateien entfernen/anpassen

```text
- public/sw.js → löschen (oder zu .bak umbenennen)
- src/hooks/useOptimizedCache.ts → registerOfflineSupport entfernen
- src/components/PWA/PWAUpdateBanner.tsx → entfernen (optional)
```

---

## Sicherheitsmaßnahmen

1. **Kein Datenverlust**: Vor Reload wird geprüft, ob pending saves existieren
2. **Timeout-Fallback**: Nach 30 Sekunden wird auch bei pending saves neu geladen (mit Toast-Warnung)
3. **Offline-Erkennung**: Wenn offline, kein Reload-Versuch

---

## Wichtig: Build-ID Automatisierung

Damit das langfristig funktioniert, sollte die `build-id.txt` bei jedem Publish automatisch aktualisiert werden. Das kann durch einen GitHub Action oder Lovable Webhook geschehen.

Als Sofortmaßnahme: Nach dem Publish die App erneut publishen oder die `build-id.txt` manuell aktualisieren.

---

## Zusammenfassung

| Komponente | Vorher | Nachher |
|------------|--------|---------|
| SW Registrierung | Doppelt (Workbox + Manual) | Nur Workbox |
| Update-Modus | Prompt (User klickt) | AutoUpdate |
| Version-Check | Einmal + 5min Cooldown | Bei jedem Tab-Focus |
| Reload | Nach User-Klick | Automatisch (wenn safe) |
| Pending Saves | Nicht berücksichtigt | Geprüft vor Reload |

