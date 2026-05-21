# TODO: Wetterdaten-Abdeckung verbessern (Post-V2.2)

## Befund (Live-QA V2.2)
Im aktuellen Live-Datensatz liegen Wetterdaten nur an ca. **45/90 Tagen**
(~50 %) vor. Die V2.2-Analyse markiert das vorsichtig als Datenqualitäts-
hinweis und verzichtet auf starke Wetter-Aussagen, wenn schmerzfreie
Vergleichstage zusätzlich fehlen.

## Folgen für die Analyse
- Druckabfall- und Druckanstiegs-Vergleiche sind nur eingeschränkt
  belastbar.
- Wetter-Findings dürfen nicht als "korreliert stark" formuliert werden.
- ME/CFS-Wetter-Interaktionen sind aktuell nicht zuverlässig
  ableitbar.

## Mögliche Ursachen (zu prüfen)
- Wetterlogs werden nur bei Schmerz-/App-Nutzung erzeugt, nicht täglich.
- Backfill (`backfill-entry-weather`, `daily-weather-backfill`,
  `auto-weather-backfill`) deckt nicht alle Tage ab.
- Tage ohne dokumentierten Pain-Entry haben keinen `weather_id`-Link.
- Snapshot-Fallback (`useSnapshotWeather`) wird auf manchen Geräten
  nicht ausgelöst.

## Nächste Schritte (separater Fix, NICHT in V2.2)
1. Tägliche Wetter-Snapshots pro User/Standort sicherstellen, unabhängig
   von Pain-Einträgen.
2. Backfill-Lücken sichtbar machen (Debug-Panel: Tage ohne
   `weather_id` UND ohne Snapshot).
3. Wetterdaten auch an dokumentierten Nicht-Schmerz-Tagen einsammeln,
   damit Vergleichsgruppen entstehen.
4. SSOT für Wetter-Coverage (`WeatherDayFeature.weatherCoverage`)
   konsistent in PreAnalysis + AnalysisV2 + AnalysisV21 nutzen.
5. Wetter-Backfill-Job (Cron) auf täglich/2x täglich umstellen.

## Akzeptanz für späteren Fix
- Wetterabdeckung > 85 % der dokumentierten Tage.
- Pro Tag mind. Luftdruck + Temperatur + Δ24h vorhanden.
- Mind. 10 schmerzfreie Vergleichstage mit Wetter im Standard-Zeitraum.
