## Ziel

Die zwei bestehenden KI-Pfade an **einem Eingang** auf der Startseite zusammenführen, ohne den bekannten Statistik-Tab zu entfernen. Nutzer entscheidet erst im Dialog, ob er die Analyse **ansehen**, als **PDF** oder als **Tagebuch + KI-PDF** will.

## Neuer Flow

Startseite → Karte „Bericht erstellen" → neue Unter-Aktion **„KI-Analyse"** öffnet einen Dialog im App-Stil:

```text
┌─ KI-Analyse ─────────────────────────────┐
│  Noch 5 / 5 Analysen diesen Monat        │
├──────────────────────────────────────────┤
│ 👁  Analyse ansehen                       │
│    Muster & Hinweise direkt in der App   │
├──────────────────────────────────────────┤
│ 📄  Nur KI-Analyse als PDF                │
│    Kompakter Bericht zum Teilen          │
├──────────────────────────────────────────┤
│ 📘  Tagebuch + KI-Analyse als PDF         │
│    Vollständiger Arztbericht             │
├──────────────────────────────────────────┤
│                            [ Abbrechen ] │
└──────────────────────────────────────────┘
```

- **Ansehen** → navigiert direkt in `Auswertung & Statistik → Tab „KI-Analyse"` und triggert dort die Analyse (genau das, was heute schon existiert, bleibt unverändert).
- **Nur KI-PDF** → ruft `generate-ai-diary-report` ohne den vollen Tagebuch-Anhang auf → PDF erscheint unter „KI-Berichte".
- **Tagebuch + KI** → heutiger „Bericht erstellen"-Pfad mit Checkbox „KI-Analysebericht" automatisch aktiviert.

Der Statistik-Tab **bleibt** als zweiter Schnellzugang für Power-User (deine Entscheidung zu Punkt 1).

## Quota-Vereinheitlichung

Heute getrennt:
- `pattern_analysis` (Statistik-Tab/„Ansehen"): ~3 / Monat
- `ai_diary_report` (PDF): 5 / Monat

Neu: **beide auf 5 / Monat**, weiterhin **getrennt** gezählt (kein Daten-Migrationsrisiko, einfache Anpassung der Limit-Konstanten in den Edge Functions). So gilt fair: jede Variante hat ihr eigenes faires Limit, der Nutzer wird nicht durch Mischnutzung bestraft.

Im Dialog wird der **kleinere verbleibende Wert** prominent angezeigt, plus eine kleine Aufschlüsselung beim Ausklappen („Ansehen: 4/5 · PDF: 3/5").

## Label-Klarheit

- Statistik-Tab umbenennen: „KI-Analyse" → **„Mustererkennung (KI)"** (macht klar: Live-Ansicht, kein Bericht).
- Startseite/Bericht-Karte: neue Sektion **„KI-Analyse"** als Sammelpunkt.

## Technische Umsetzung

### Frontend
1. Neue Komponente `KiAnalyseDialog.tsx` (shadcn `Dialog`) mit den 3 Aktions-Karten + Quota-Anzeige oben.
2. Einstiegspunkt: neue Sub-Karte/Button **„KI-Analyse"** in der bestehenden Bericht-erstellen-Ansicht.
3. Aktions-Handler:
   - **Ansehen** → `navigate('/auswertung?tab=ki-analyse&autorun=1')`
   - **Nur PDF** → bestehender PDF-Pfad, aber neues Flag `mode: 'ai-only'` an `generate-ai-diary-report`.
   - **Tagebuch + KI** → bestehender Bericht-Wizard mit vorausgewählter Checkbox.
4. Label-Änderung in `de.json`: `statistics.tabs.aiAnalysis` → „Mustererkennung (KI)".
5. Quota-Daten via bestehender `get_pattern_analysis_usage` RPC + Pendant für `ai_diary_report` parallel laden (React Query).

### Backend / Edge Functions
1. `analyze-voice-patterns`: Limit-Konstante von 3 → **5**.
2. `generate-ai-diary-report`: neuen optionalen Body-Param `mode: 'full' | 'ai-only'` (default `'full'`) — bei `'ai-only'` wird der PDF-Renderer ohne die Tagebuch-Tabellen aufgerufen, nur Cover + KI-Textblock.
3. Keine DB-Migration nötig (Limits sind in Code, nicht in der DB).

### Auswertung-Page
- Liest neuen URL-Param `?tab=ki-analyse&autorun=1` → öffnet Tab und triggert automatisch die Analyse-Funktion (so wie der Tab-Klick es heute tut).

## Was NICHT geändert wird

- Statistik-Tab-Funktionalität (nur Label).
- Bestehender Bericht-Wizard (nur neue Vorbelegung der KI-Checkbox aus dem Dialog).
- DB-Schema, RLS-Policies, Storage-Bucket.
- Keine Quota-Zusammenführung in eine gemeinsame Tabelle.

## Akzeptanzkriterien

- Aus „Bericht erstellen" → „KI-Analyse" sind alle drei Pfade in max. 2 Klicks erreichbar.
- Quota im Dialog ist korrekt (5/Monat je Variante, getrennt gezählt).
- „Ansehen" landet auf demselben Tab/Inhalt wie heute, ohne dass der Nutzer manuell auf „Analysieren" klicken muss.
- „Nur PDF" erzeugt ein kürzeres PDF ohne Tagebuch-Tabellen, taucht in „KI-Berichte" auf.
- „Tagebuch + KI" verhält sich wie heute mit aktivierter Checkbox.
- Statistik-Tab heißt nun „Mustererkennung (KI)".
