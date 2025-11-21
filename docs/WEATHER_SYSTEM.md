# Wetter-System Dokumentation

## Überblick

Das Wetter-System speichert automatisch historische Wetterdaten für jeden Migräne-Eintrag basierend auf Zeitpunkt und Koordinaten. Alle Prozesse laufen im Hintergrund ohne Nutzer-Interaktion.

## Architektur

### 1. Datenmodell

**Tabelle: `weather_logs`**
- `id` - Primärschlüssel
- `user_id` - Zuordnung zum User
- `latitude`, `longitude` - Koordinaten (gerundet auf 3 Dezimalstellen = ~111m)
- `lat_rounded`, `lon_rounded` - Computed columns für Index (2 Dezimalstellen = ~1km)
- `snapshot_date` - Datum der Wetterdaten (YYYY-MM-DD)
- `requested_at` - Zeitpunkt für den die Daten gelten (neu!)
- `temperature_c`, `pressure_mb`, `humidity` - Wetterwerte
- Weitere Felder: `wind_kph`, `condition_text`, etc.

**Tabelle: `pain_entries`**
- `weather_id` - Foreign Key zu `weather_logs.id`
- `latitude`, `longitude` - Koordinaten des Eintrags (optional)
- `selected_date`, `selected_time` - Ereigniszeitpunkt
- `timestamp_created` - Automatisch gesetzt

### 2. Kopplung Entry ↔ Weather

Pro Eintrag wird genau **ein** Weather-Log zugeordnet:
```
pain_entries.weather_id → weather_logs.id
```

Der Weather-Log enthält die historischen Wetterdaten für:
- **Zeitpunkt**: `requested_at` (aus `selected_date` + `selected_time`)
- **Ort**: `latitude` + `longitude` (aus Eintrag oder User-Profil)

## Funktionsweise

### Beim Erstellen eines Eintrags

1. **Frontend**: Speichert `selected_date`, `selected_time`, `latitude`, `longitude` in `pain_entries`
2. **Backend**: `timestamp_created` wird automatisch gesetzt
3. **Weather-Fetch**: Erfolgt asynchron (siehe Backfill)

### Automatischer Backfill (alle 3 Stunden)

**Edge Function**: `auto-weather-backfill`

**Ablauf**:
1. Sucht alle Einträge mit `weather_id = NULL`
2. Für jeden Eintrag:
   - Ermittelt Koordinaten (Priorität: Eintrag → User-Profil)
   - Ruft `fetch-weather-hybrid` auf mit:
     - `lat`, `lon` 
     - `at` = `selected_date` + `selected_time`
   - Speichert `weather_id` im Eintrag
3. Rate Limiting: 100ms Pause zwischen Requests

**Cron-Job**: Läuft alle 3 Stunden automatisch (siehe SQL unten)

### Weather-Fetch mit Cache

**Edge Function**: `fetch-weather-hybrid`

**Caching-Strategie**:
- Prüft zuerst vorhandene `weather_logs` innerhalb **5km Radius** und **gleicher Stunde**
- Falls gefunden: Wiederverwendung (kein neuer API-Call)
- Falls nicht gefunden: Ruft Open-Meteo API auf (kostenlos, historische Daten)

**API-Auswahl**:
- **>1 Stunde in Vergangenheit**: Open-Meteo Hourly Archive (präzise historische Daten)
- **Letzte Stunde**: Open-Meteo Current (aktuelle Daten)

**Neue Verbesserungen**:
- ✅ `requested_at` wird befüllt für besseres Tracking
- ✅ Fehlerbehandlung prüft Distanz statt nur Datum
- ✅ Computed columns `lat_rounded`, `lon_rounded` für effizienten Index

## Cron-Job Einrichtung

Um den automatischen Backfill zu aktivieren, führe folgendes SQL in der Supabase SQL Console aus:

```sql
-- Aktiviere pg_cron und pg_net Extensions (falls noch nicht aktiv)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Erstelle Cron-Job: Alle 3 Stunden
SELECT cron.schedule(
  'auto-weather-backfill-job',
  '0 */3 * * *',  -- Alle 3 Stunden zur vollen Stunde
  $$
  SELECT net.http_post(
    url := 'https://lzcbjciqrhsezxkjeyhb.supabase.co/functions/v1/auto-weather-backfill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'dev-test-secret'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Prüfe Status des Cron-Jobs
SELECT * FROM cron.job WHERE jobname = 'auto-weather-backfill-job';
```

**Wichtig**: 
- `x-cron-secret` muss mit dem Wert in Supabase Secrets übereinstimmen
- Für Production einen sicheren Secret verwenden!

## Debugging

### Debug-Endpoint

**Edge Function**: `debug-weather-status`

**Aufruf** (im Frontend):
```typescript
const { data } = await supabase.functions.invoke('debug-weather-status');
console.log(data);
```

**Output**:
```json
{
  "summary": {
    "entries_without_weather": 5,
    "entries_checked": 10,
    "coordinate_mismatches": 0
  },
  "recent_entries": [
    {
      "entry_id": 123,
      "date": "2025-11-21",
      "time": "14:30",
      "entry_coords": "51.5100, 7.4600",
      "weather_coords": "51.5100, 7.4600",
      "distance_km": "0.00",
      "status": "ok",
      "weather_id": 456,
      "temperature": 12.5
    }
  ]
}
```

### Manueller Test

1. **Erstelle Test-Einträge**:
   ```sql
   -- Eintrag A: Dortmund um 08:00
   INSERT INTO pain_entries (user_id, selected_date, selected_time, latitude, longitude, pain_level)
   VALUES ('USER_ID', '2025-11-22', '08:00', 51.51, 7.46, 'mittel');
   
   -- Eintrag B: Essen um 14:00 (30km entfernt!)
   INSERT INTO pain_entries (user_id, selected_date, selected_time, latitude, longitude, pain_level)
   VALUES ('USER_ID', '2025-11-22', '14:00', 51.45, 7.01, 'stark');
   ```

2. **Trigger Backfill manuell**:
   ```bash
   curl -X POST https://lzcbjciqrhsezxkjeyhb.supabase.co/functions/v1/auto-weather-backfill \
     -H "x-cron-secret: dev-test-secret"
   ```

3. **Prüfe Ergebnis**:
   ```sql
   SELECT 
     pe.id,
     pe.selected_time,
     ROUND(pe.latitude::numeric, 4) as entry_lat,
     ROUND(wl.latitude::numeric, 4) as weather_lat,
     ROUND(
       (6371 * acos(
         cos(radians(pe.latitude)) * cos(radians(wl.latitude)) * 
         cos(radians(wl.longitude) - radians(pe.longitude)) + 
         sin(radians(pe.latitude)) * sin(radians(wl.latitude))
       ))::numeric,
       2
     ) as distance_km,
     wl.temperature_c,
     wl.requested_at
   FROM pain_entries pe
   JOIN weather_logs wl ON pe.weather_id = wl.id
   WHERE pe.selected_date = '2025-11-22'
   ORDER BY pe.selected_time;
   ```

   **Erwartung**: `distance_km < 1` für beide Einträge

## Migration vom alten System

**Problem**: Alter UNIQUE INDEX `(user_id, snapshot_date)` erlaubte nur einen Weather-Log pro Tag

**Lösung**: 
1. ✅ Index entfernt
2. ✅ Neue Spalte `requested_at` für präzises Zeittracking
3. ✅ Computed columns `lat_rounded`, `lon_rounded` für effizienten Index
4. ✅ Keine strikten UNIQUE Constraints mehr - Duplikaterkennung in Anwendungslogik (5km Radius)

**Bestehende Daten**: Bleiben erhalten, `requested_at` wird automatisch aus `created_at` befüllt

## Keine UI-Änderungen

Das System funktioniert vollständig im Hintergrund:
- ❌ Keine "Wetter aktualisieren"-Buttons
- ✅ Wetterdaten werden automatisch angezeigt wenn vorhanden
- ✅ Backfill läuft automatisch alle 3 Stunden
- ✅ Offline-fähig (Entries werden später verarbeitet)

## Fehlerbehandlung

- **Keine Koordinaten**: Entry wird übersprungen, kein Weather-Log erstellt
- **API-Fehler**: Entry behält `weather_id = NULL`, wird beim nächsten Backfill erneut versucht
- **Rate Limiting**: 100ms Pause zwischen Requests
- **Batch-Limit**: 50-100 Entries pro Backfill-Run

## Performance

**Optimierungen**:
- Index auf `(user_id, requested_at, lat_rounded, lon_rounded)` für schnelle Cache-Lookups
- 5km Proximity-Caching reduziert API-Calls dramatisch
- Computed columns vermeiden Runtime-Berechnungen
- Batch-Processing verhindert Timeouts

## Sicherheit

- ✅ Alle Edge Functions mit JWT-Authentifizierung (außer Cron-Jobs mit Secret)
- ✅ RLS Policies auf `weather_logs` und `pain_entries`
- ✅ Service Role Key nur in Backfill-Funktionen
- ✅ Cron-Secret für automatisierte Aufrufe
