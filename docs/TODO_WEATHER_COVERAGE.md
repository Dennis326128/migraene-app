# Weather Coverage & Analysis V2.3 — Plan

Status: **Plan, noch nicht implementiert.** Keine produktiven Daten werden
durch dieses Dokument verändert.

---

## 1. Ist-Zustand (Live-QA V2.2)

### Datenlage
- Live-Datensatz 90 Tage: **~45/90 Tage** mit Wetter (≈ 50 %).
- Folge: V2.2 markiert Wetter vorsichtig als Datenqualität, vermeidet starke
  Aussagen, wenn schmerzfreie Vergleichstage fehlen.

### Tabelle `weather_logs` (geprüft)
Vorhandene Spalten:
`id, user_id, latitude, longitude, lat_rounded, lon_rounded, location,
temperature_c, pressure_mb, pressure_change_24h, pressure_trend_24h,
humidity, wind_kph, dewpoint_c, condition_text, condition_icon, moon_phase,
moonrise, moonset, snapshot_date, requested_at, created_at`.

Keine `source`-, `coverage_status`-, `backfilled_at`- oder `error`-Spalten.
Kein eindeutiger Index auf `(user_id, snapshot_date, lat_rounded,
lon_rounded)` dokumentiert → Duplikat-Risiko.

### Wetter-Erzeugungspfade (Edge Functions, gefunden)
- `fetch-weather`, `fetch-weather-hybrid`, `fetch-weather-meteo` — synchrone
  Einzelfetches.
- `backfill-entry-weather`, `backfill-missing-weather`,
  `auto-weather-backfill`, `daily-weather-backfill`,
  `batch-weather-import`, `clean-weather-import`, `debug-weather-status`.

Beobachtung: Mehrere Backfill-Pfade nebeneinander, kein erkennbarer SSOT.
Schreibt teilweise pro Entry (an `pain_entries.weather_id` gebunden),
teilweise als Tages-Snapshot.

### Vermutete Lücken-Ursachen
1. Wetter wird primär **entry-getriggert** geschrieben → keine
   Nicht-Schmerz-Vergleichstage.
2. Backfill-Cron-Status unklar (läuft? mit welchem Intervall? für welche
   User?).
3. Tage ohne Koordinaten / ohne Consent erzeugen still keine Zeile.
4. Doppelschreibungen pro Tag möglich, keine Unique-Constraint.

---

## 2. Analyse V2.2 Konsistenzplan (App ↔ Shared ↔ Website)

### App vs Shared
| Aspekt | App (`analyze-voice-patterns`) | Shared (`analyze-voice-patterns-shared`) |
|---|---|---|
| Prompt | Inline V2.2 + V2.1-Findings-Block | `_shared/analysisCore.ts` (Kurzform, neu V2.2-Regeln) |
| Deterministische `analysisV21.findings` | ✅ vollständig | ❌ fehlen |
| Postprocess (`postprocess.ts`) | ✅ | ❌ |
| `curateFindingsV22` Server-seitig | ❌ (Client kuratiert) | ❌ |
| `analysis_version` | `2.2.0` | `2.2.0` (jetzt) |
| `schema_version` | `2.1` | `2.1` (jetzt) |

### Refactor-Plan „Shared Engine V2.2“ (kein Big-Bang)

Phase 1 — **Extract** (klein, sicher):
1. `_shared/analysisV21Builder.ts` neu: deterministische V2.1-Findings
   (aktuell inline in `analyze-voice-patterns/index.ts`) als reine Funktion
   `buildAnalysisV21(dataset, opts)` extrahieren.
2. `_shared/analysisPostprocess.ts` neu: aktuelle `postprocess.ts` 1:1
   verschieben + von beiden Endpoints importieren.
3. App-Endpoint nur noch dünn: Datenset bauen → `buildAnalysisV21` → LLM
   (Prompt aus `analysisCore`) → `postprocess`.

Phase 2 — **Shared adoptiert**:
4. `analyze-voice-patterns-shared` ruft `buildAnalysisV21` + Postprocess
   ebenfalls. Privacy-Optionen über `BuildOptions` (`includesPrivateNotes:
   false`, `excludeRedFlags: true`).
5. Beide Endpoints schreiben identisch strukturiertes
   `response_json.analysisV21`.

Phase 3 — **View-Layer** (optional, Variante B für Website):
6. `_shared/curateAnalysisV22View.ts` neu (Port von
   `src/lib/ai/curateFindingsV22.ts` nach Deno).
7. Beim Persist von `ai_reports.response_json` zusätzlich
   `patternAnalysisV21View` ablegen:
   ```ts
   patternAnalysisV21View?: {
     strongest: Finding[];      // ≤ 4
     weaker: Finding[];         // ≤ 5
     medication: Finding[];     // 1 stärkste
     weather: Finding[];        // 1 stärkste
     mecfs: Finding[];          // 0..1
     dataQuality: Finding[];    // ≤ 3, kein Voice-Event
     openQuestions: string[];   // ≤ 5
   }
   ```
8. `get-shared-report-data` reicht View durch, falls vorhanden. Website
   nutzt View bevorzugt, fällt sonst auf rohe `patternAnalysisV21` zurück.

### Risiken
- LLM-Output-Format kann beim Verschieben der Prompts driften → Phase 1
  verlangt Snapshot-Tests gegen `extractAnalysisFromLLMResponse`.
- Deterministischer Builder hat Abhängigkeiten zu Datenset-Shape — vor
  Extract per Test fixieren.
- View im DB-JSON erzeugt einmaligen Versionssprung; Website muss tolerant
  parsen (Variante B nur additiv, nichts entfernen).

### Kleinste sichere nächste Schritte
1. **Phase 1, Schritt 1** (Extract `buildAnalysisV21`) hinter Snapshot-Test.
2. Erst danach Phase 1, Schritt 2 (Postprocess shared).
3. Phase 2/3 separat planen, nachdem Phase 1 grün live ist.

### Curation App vs Website
- **Kurzfristig (empfohlen)**: Website portiert `curateFindingsV22`
  (eigener Folge-Prompt im Website-Projekt).
- **Mittelfristig**: Variante B (View im Server) ersetzt beide Client-
  Curations.

---

## 3. Wetter V2.3 — Zielmodell

### Daily Weather Spine
Pro `(user_id, snapshot_date, lat_rounded, lon_rounded)` genau eine Zeile
mit: Druck, Δ24h, Trend, Temperatur, Luftfeuchte, Bedingung, Quelle.

### Relevante Tage
- jeder Tag mit Pain-Entry (T0)
- T-1 … T-3 jedes Pain-Entries (Lag-Analyse)
- jeder Tag mit Tagesfaktor-Eintrag (Vergleichstage)
- optional jeder Tag im Analysezeitraum, sofern Koordinaten + Consent

### Optionen verglichen

| Option | Vorteil | Nachteil | Empfehlung |
|---|---|---|---|
| 1 — On-demand Backfill bei Analyse | bessere Analyse sofort | langsam, Quota, fragil | nur als Notfall |
| 2 — Daily Snapshot Cron | sauber, dauerhaft | Cron + Consent | mittelfristig |
| 3 — Entry-triggered T0..T-3 | gezielt, wenig Quota | keine Nicht-Schmerz-Tage | sofort |
| 4 — Hybrid (3 + 2 light) | volle Abdeckung ohne Massiv-Backfill | etwas mehr Komplexität | **Ziel** |

### Empfehlung
- **Sofort (V2.3a)**: Option 3 — bestehender Entry-Trigger weitet sich auf
  T-1..T-3 aus. Bestehende `fetch-weather-hybrid` als SSOT setzen, andere
  Pfade deprecaten.
- **Danach (V2.3b)**: Option 2 light — täglicher Snapshot nur für aktive
  User mit Consent + bekanntem Standort, mit Cron-Limit + Idempotenz über
  Unique-Index.
- **Backfill**: nur **manuell/QA-gesteuert** über `backfill-missing-weather`
  mit Zeitraum-Limit. Kein Auto-Massiv-Backfill.

---

## 4. Datenschutz / Consent

- Wetter ≠ Gesundheitsdatum, aber abgeleitet aus Standort → Consent-Pflicht.
- Lat/Lng werden bereits gespeichert (`weather_logs.latitude/longitude` +
  `lat_rounded/lon_rounded`). Doctor-Share darf **nur** abgeleitete
  Wetterwerte zeigen, keine Koordinaten — bereits durch
  `getDoctorShareSafeAnalysis` abgedeckt (zu verifizieren bei View-
  Erstellung).
- Daily-Snapshot-Cron darf nur laufen, wenn:
  - `user_consents.ai_processing_consent = true` **und**
  - Standort vom User freigegeben (`user_profiles.latitude/longitude` oder
    aktuelle Geolocation) **und**
  - Tracking nicht widerrufen.
- Backfill darf historisch keine neuen Standorte erfinden — nur Tage
  füllen, für die ein Standort am jeweiligen Tag bekannt ist (aus
  `pain_entries.latitude/longitude` oder `user_profiles`).

---

## 5. Schema-Vorschlag (noch keine Migration)

Vorschlag, **falls** Hybrid umgesetzt wird:

```sql
ALTER TABLE weather_logs
  ADD COLUMN source text
    CHECK (source IN ('entry_triggered','daily_snapshot','backfill','manual')),
  ADD COLUMN coverage_status text
    CHECK (coverage_status IN ('ok','missing_location','api_failed','no_consent','not_available')),
  ADD COLUMN backfilled_at timestamptz,
  ADD COLUMN provider text;

CREATE UNIQUE INDEX weather_logs_user_day_loc_uniq
  ON weather_logs (user_id, snapshot_date, lat_rounded, lon_rounded)
  WHERE snapshot_date IS NOT NULL;
```

Nicht jetzt ausführen — erst nach Entscheidung Hybrid ja/nein und nach
Bereinigung möglicher Duplikate.

---

## 6. Analyse-Logik Wetter V2.3

- 4-Felder-Vergleich (2×2: Schmerz × Druckabfall) statt Single-Side.
- Lags: T0, T-1, T-2, T-3.
- Mindestschwellen:
  - ≥ 10 schmerzfreie Vergleichstage **mit** Wetter → Korrelation erlaubt.
  - sonst nur „möglicher Hinweis“ + Datenqualitätsnotiz.
- Output-Regeln:
  - max 1 Wetter-Card unter „strongest/weaker“.
  - max 1 Wetter-Card unter „dataQuality“ (Coverage).
  - kein Duplikat in beiden gleichzeitig — `curateFindingsV22` deckt das
    schon ab, muss bei V2.3 nur die neuen Lag-Codes mitnehmen.

---

## 7. Testplan V2.3

1. 90/90 Wettertage, ≥ 30 schmerzfrei → erlaubt „moderate“ Wetter-Finding.
2. 90/45 Wettertage, < 10 schmerzfrei mit Wetter → nur „insufficient“ +
   DQ-Card.
3. Nur Schmerztage haben Wetter → niemals starke Korrelation.
4. Druckabfall an Schmerztagen **und** schmerzfreien Tagen gleich häufig
   → kein Finding.
5. Backfill 500-Fehler → Analyse bleibt grün, markiert Lücke.
6. Kein Consent / keine Koordinaten → kein Fetch, klare DQ-Card.
7. Lag-Test: Druckabfall T-1 öfter vor Schmerz → eigene Lag-Finding statt
   T0.

---

## 8. Aktuelle Akzeptanzkriterien (für späteren Live-Fix)
- Wetterabdeckung > 85 % der dokumentierten Tage.
- Pro Tag mindestens Luftdruck + Temperatur + Δ24h.
- Mindestens 10 schmerzfreie Vergleichstage mit Wetter im Standard-
  Zeitraum.
- Keine Duplikate pro `(user, day, loc)`.
- `source` und `coverage_status` gesetzt.

---

## Weather V2.3 — Phasenplan (Phase 2 Stand)

Reihenfolge der späteren Umsetzung. **Noch NICHT bauen** — kein Backfill,
kein Cron, keine Migration, kein Provider-Wechsel.

### Phase W1 — Weather SSOT
- Inventar aller Edge-Funktionen mit Wetter-Zugriff:
  `fetch-weather`, `fetch-weather-meteo`, `fetch-weather-hybrid`,
  `backfill-entry-weather`, `backfill-missing-weather`,
  `backfill-future-entries`, `batch-weather-import`, `clean-weather-import`,
  `auto-weather-backfill`, `daily-weather-backfill`, `debug-weather-status`.
- Ziel-Funktion festlegen: **`fetch-weather-hybrid`** als alleinige
  Schreib-/Cache-Funktion. Alle anderen werden Wrapper oder entfallen.
- Keine neuen Duplikate. Lese-Pfade nutzen direkt `weather_logs`.

### Phase W2 — Schema/Index
- Dup-Bereinigung planen (Pre-Flight-Query):
  `SELECT user_id, snapshot_date, COUNT(*) FROM weather_logs GROUP BY 1,2 HAVING COUNT(*)>1`.
- Optionale Migration:
  - `source TEXT` (`'entry_trigger'|'daily_snapshot'|'backfill'|'manual'`)
  - `coverage_status TEXT` (`'ok'|'limited'|'insufficient'`)
  - `backfilled_at TIMESTAMPTZ`
  - `lat_rounded NUMERIC(5,2)`, `lon_rounded NUMERIC(5,2)`
  - Unique Index `(user_id, snapshot_date, lat_rounded, lon_rounded)`
- Migration wird **erst nach W1** geschrieben.

### Phase W3 — Entry-triggered T0..T-3
- Bei jedem Schmerz-/Tagesfaktor-Eintrag: Wetter für Tag 0 und die 3
  vorhergehenden Tage anfordern, sofern nicht bereits vorhanden.
- Idempotent über Unique-Index aus W2.
- Keine historischen Massencalls.

### Phase W4 — Daily Snapshot light
- Cron 1×/Tag, nur für aktive User mit Standort + Wetter-Consent.
- Speichert pro User einen `daily_snapshot`-Eintrag.
- **Kein** Doctor-Share-Zugriff auf Koordinaten.

### Phase W5 — Analyse V2.3 Wetterlogik
- 2×2-Vergleich (Pain × Pressure-Drop) mit Mindestschwellen:
  `dropDays ≥ 5` UND `painFreeStableDays ≥ 5`.
- Zeitfenster T0/T-1/T-2/T-3, je separat ausgewertet.
- Pro Report: **max 1 Wetter-Hauptkarte + 1 Wetterdatenqualitätskarte**.
- Bei unzureichender Vergleichsbasis: nur Datenqualitätskarte, keine
  Korrelationsaussage.

### Aktueller Stand
- `src/lib/ai/weatherCoverage.ts` als read-only Helper bereit.
- Server-PreAnalysis (Phase 2) berechnet bereits `daysWithData`,
  `pressureDropDays`, `stableDays`, `painOn*Days` — V2.3-Logik kann
  ohne Schemaänderung Mindestschwellen testen.
