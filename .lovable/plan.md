# Δ24h-Luftdruck — Ursachenanalyse & Fix-Plan

## Ist-Stand (DB-Auswertung)

Aus `weather_logs` (3.016 Zeilen):

| Bucket | Anzahl | Anteil ohne Δ24h |
|---|---|---|
| `Current weather` (Live-API) | 972 | **1 %** |
| `Historical data (HH:00)` (Hourly-Archive) | ~1.150 | **50–73 %** |
| Tagesmittel-Fallback | Rest | gemischt |

**~921 von 3.010 Druckwerten (≈30 %)** haben Druck, aber **kein** Δ24h.

## Warum Δ24h fehlt — 5 konkrete Ursachen im Code

1. **Hourly-Archive-Pfad setzt Δ24h hart auf null.**
   `supabase/functions/fetch-weather-hybrid/index.ts:348`
   ```
   pressure_change_24h: null, // Will be calculated below from DB
   ```
   Δ wird **nicht** aus der API gezogen, obwohl die Archive-API den Stundenwert von T−24h problemlos liefern kann.

2. **DB-Fallback ist die einzige Quelle für historische Δ — und scheitert oft.**
   `fetch-weather-hybrid/index.ts:413–461` sucht einen anderen `weather_log` desselben Users mit gleichem `lat_rounded`/`lon_rounded` innerhalb **±90 min um T−24h**. Wer nicht täglich mehrere Einträge erstellt, hat dort schlicht keinen Treffer → Δ bleibt NULL. Genau das Muster zeigt die Statistik (60–72 % NULL bei `Historical data (HH:00)`).

3. **Cache-Hit liefert alte NULL-Werte zurück und repariert sie nie.**
   `fetch-weather-hybrid/index.ts:241–252`: Sobald ein Log mit derselben Stunde im 5 km-Radius existiert, wird dessen `id` zurückgegeben — auch wenn `pressure_change_24h IS NULL`. Selbst wenn inzwischen ein 24 h-Vorgängerlog existiert, wird die NULL nie nachgezogen.

4. **`backfill-entry-weather` schreibt Δ explizit als NULL und kein Job holt sie nach.**
   `supabase/functions/backfill-entry-weather/index.ts:252` (`pressure_change_24h: null, // never fabricate 0`).
   `auto-weather-backfill` / `daily-weather-backfill` füllen nur fehlende `weather_id` an Einträgen — sie patchen **keine** vorhandenen `weather_logs` mit NULL-Δ.

5. **Client-Hook reicht den Ausfall nur durch.**
   `src/features/entries/hooks/usePressureDelta24h.ts` macht denselben DB-Lookup wie der Server, fällt also bei sparsamer Nutzung genauso aus. Zusätzlich: `bestMatch = data[0]` wird vor dem Self-Skip nicht zurückgesetzt → bei nur einem Kandidaten (=self) liefert er fälschlich `delta = 0`.

## Ziel

Δ24h ist für **jeden** `weather_log` mit `pressure_mb IS NOT NULL` deterministisch verfügbar — unabhängig davon, wie sparsam der User Einträge macht.

## Fix-Plan (klein, fokussiert, keine Großarchitektur)

### Schritt 1 — Δ24h direkt aus Open-Meteo holen (Live + Hourly)

In `supabase/functions/fetch-weather-hybrid/index.ts`:

- **Hourly-Pfad (Zeile 312–360):** Archive-Call so erweitern, dass `start_date = requestDate - 1d` und `end_date = requestDate`. Aus `data.hourly` den Wert bei Stunde T und T−24h (gleiche `lat/lon`) lesen und `pressure_change_24h = surface_pressure[T] − surface_pressure[T−24h]` setzen. Wenn nur Tagesmittel sinnvoll: bestehender Daily-Fallback (Zeile 363–405) bleibt unverändert.
- **Current-Pfad (Zeile 263–306):** Aktuell wird nur das Tagesmittel von gestern abgefragt. Stattdessen die letzten 25 Stunden aus `archive-api` ziehen und das Δ aus identischer Stunde des Vortages bilden (genau wie ICHD-/Wetter-Memory beschreibt). Bei API-Fehler: bestehender Tagesmittel-Fallback bleibt als zweite Wahl.
- **Tagesmittel-Fallback (Zeile 363–405):** unverändert.
- **DB-Fallback (Zeile 413–461):** bleibt als dritte Sicherheitsebene erhalten, läuft aber nur noch, wenn API-Δ wirklich nicht ermittelbar ist.

Resultat: Neue Logs haben Δ24h aus der API → unabhängig vom DB-Zustand.

### Schritt 2 — Stale-NULL-Δ beim Cache-Hit nachziehen

In `fetch-weather-hybrid/index.ts:225–252`: Wenn der Cache-Treffer `pressure_change_24h IS NULL`, **nicht** sofort zurückgeben, sondern Δ einmalig nachholen (Archive-Call wie Schritt 1) und mit `UPDATE` in den Log schreiben — danach `id` zurückgeben. Kein neuer Log, keine Duplikate.

### Schritt 3 — Einmalige Repair-Edge-Function für Altbestand

Neue `supabase/functions/repair-pressure-delta-24h/index.ts`:

- Authentifiziert über `x-cron-secret` (wie `auto-weather-backfill`).
- Paginierter Loop über `weather_logs WHERE pressure_mb IS NOT NULL AND pressure_change_24h IS NULL` (Limit z. B. 200 / Lauf, Rate-Limit 200 ms).
- Pro Zeile: Archive-API mit `lat_rounded`, `lon_rounded`, T und T−24h aufrufen, Δ berechnen, `UPDATE weather_logs SET pressure_change_24h = …`.
- Idempotent: läuft nur über NULL-Zeilen.

Erst einmal manuell triggern, danach optional `pg_cron` täglich (kostet ca. 921 ÷ 200 = 5 Läufe für den aktuellen Altbestand).

### Schritt 4 — `usePressureDelta24h` defensiv korrigieren

`src/features/entries/hooks/usePressureDelta24h.ts`:

- `bestMatch`-Initialwert erst nach dem Self-Skip-Filter wählen, damit nicht versehentlich der eigene Log als „24 h-Referenz" zählt (`delta = 0`-Artefakt).
- Wenn keine Kandidaten gefunden werden, *einmalig* `fetch-weather-hybrid` für T−24h aufrufen (gleicher `lat/lon`) — der Server schreibt dann automatisch einen `weather_log` und liefert Δ via Schritt 1 zurück. Cache via React-Query (`staleTime: 6h`, `gcTime: 24h`) bleibt erhalten.

### Schritt 5 — Tests

- `supabase/functions/fetch-weather-hybrid/*_test.ts` (neu): Mock Open-Meteo-Antwort mit Stundenwerten → erwartet `pressure_change_24h !== null` für Hourly- und Current-Pfad. Cache-Hit mit `pressure_change_24h = null` → erwartet UPDATE mit echtem Δ.
- `src/features/entries/hooks/usePressureDelta24h.test.ts` (neu): Self-Skip-Regression (nur eigener Log → liefert `missing`, nicht `0`).
- Repair-Funktion: Unit-Test über kleinen synthetischen Datensatz.

### Schritt 6 — Erfolgskontrolle

Nach Schritt 3 + 1 erneut messen:
```sql
SELECT COUNT(*) FILTER (WHERE pressure_mb IS NOT NULL AND pressure_change_24h IS NULL) AS still_missing,
       COUNT(*) FILTER (WHERE pressure_change_24h IS NOT NULL) AS has_delta
FROM weather_logs;
```
Zielwert: `still_missing` nahe 0 (verbleibende Lücken nur dort, wo die Open-Meteo-Archive selbst keine Werte für die Region/Stunde liefert).

## Was sich NICHT ändert

- Kein DB-Schema-Wechsel, keine Migration.
- Keine UI-Änderung — bestehende Komponenten (`EntriesList`, `DiaryTimeline`, `usePressureDelta24h`) lesen weiter `pressure_change_24h`.
- Keine neuen Secrets, kein Modellwechsel, keine neuen Pflichtdokumente.
- Bestehende Curation-/Analyse-Logik unverändert.

## Antwort auf „muss ich neu analysieren?"

- **Neue Einträge:** profitieren ab Deploy automatisch (Schritt 1).
- **Altbestand:** wird durch Schritt 3 einmalig repariert — danach reicht „neu laden" in der App, keine neue KI-Analyse nötig.
