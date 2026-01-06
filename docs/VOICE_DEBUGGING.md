# Voice Routing & Debugging Guide

## Architektur-Übersicht

```
Voice Input → normalizeTranscript → scoreIntents → routeVoiceCommand → Action/UI
     ↓                                    ↓
  voiceLogger               Slot Filling (wenn incomplete)
```

## Neue Module (v2)

| Datei | Zweck |
|-------|-------|
| `normalizeTranscript.ts` | Zentrale Normalisierung (Umlaute, ASR-Fehler) |
| `intentScoring.ts` | Feature-basiertes Scoring statt if/else |
| `voiceLogger.ts` | Strukturiertes Logging für Debugging |
| `slotFilling.ts` | Follow-up Fragen bei unvollständigen Eingaben |

## Intent-Scores interpretieren

Das Scoring-System vergibt Punkte für erkannte Features:

- `has_add_verb` (+0.5): "füge...hinzu", "anlegen", etc.
- `has_dosage_pattern` (+0.25): "500 mg", "20mg"
- `has_pain_keywords` (+0.45): "schmerz", "migräne", "attacke"
- `has_analytics_keywords` (+0.5): "wie viele", "durchschnitt"
- `is_question` (+0.3): Fragezeichen oder W-Frage

## Logs lesen (Dev Mode)

In der Browser-Konsole erscheinen gruppierte Logs:

```
[VOICE] ✅ add_medication (85%)
  Transcript: "füge ibuprofen 400 mg hin..."
  Top intents: [{intent: 'add_medication', score: 0.85}, ...]
  Features: ['has_add_verb', 'has_dosage_pattern', 'known_med_alias']
  Latency: 23 ms
```

## iOS Dictation Fallback

Wenn Web Speech API nicht verfügbar (z.B. iOS PWA):
1. Overlay zeigt "Diktier-Modus" 
2. User tippt in Textfeld, nutzt iOS Keyboard-Mikrofon
3. Quick-Chips für häufige Aktionen
4. "Fertig" routet wie normale Spracheingabe

## Slot-Filling

Bei unvollständigen Eingaben (z.B. "Füge ein Medikament hinzu" ohne Name):
1. `slot_filling` State aktiviert
2. SlotFillingView zeigt Frage + Vorschläge
3. User wählt oder tippt
4. Bei Completion → Turbo-Create mit Undo

## Fehlerbehebung

### "Intent wird falsch erkannt"
1. Console-Logs prüfen (Features, Scores)
2. Normalisierung checken (`normalizeTranscript`)
3. Pattern in `intentScoring.ts` erweitern

### "Analytics-Frage wird als Notiz gespeichert"
- Prüfen ob `hasAnalyticsKeywords` matched
- Zeit-Pattern checken ("letzten X Tage")

### "Add Medication öffnet falsches Sheet"
- `hasPainKeywords` könnte matchen
- Score-Differenz zwischen Intents zu klein
