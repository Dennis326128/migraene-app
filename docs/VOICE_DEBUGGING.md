# Voice Routing & Debugging Guide

## Architektur-Übersicht

```
Voice Input → noiseGuard → lexiconCorrect → scoreIntents → voicePolicy → Action/UI
     ↓                                           ↓              ↓
voiceLogger                              SlotFilling    Disambiguation
```

## Module (v3)

| Datei | Zweck |
|-------|-------|
| `voicePolicy.ts` | Zentrale Safety Rules für Auto-Execute Entscheidungen |
| `noiseGuard.ts` | Filtert Fragmente, Füllwörter, mehrdeutige Zahlen |
| `intentLabels.ts` | Deutsche Labels + Entity-Formatierung für Live Preview |
| `userMedLexicon.ts` | ASR-Korrektur mit User-Medikamenten |
| `lastContext.ts` | Lädt letzte Einnahme/Eintrag für Kontext-Defaults |
| `DisambiguationView.tsx` | UI für Top-2 Auswahl bei knappen Scores |

## Safety Policy (voicePolicy.ts)

Thresholds:
- Navigation/Analytics: auto bei >= 0.75
- Mutations: auto bei >= 0.90, confirm bei >= 0.65
- Dictation Fallback: NIEMALS auto-mutate
- Disambiguation: wenn Top1-Top2 Score < 0.12

## Live Intent Preview

Während der Aufnahme wird alle 250ms ein Preview berechnet:
- Intent-Label (deutsch)
- Confidence (%)
- Extrahierte Entities (Medikament, Stärke, Zeit)

## Disambiguation

Bei knappen Scores (< 0.12 Differenz) erscheint:
- "Was meintest du?"
- 2 Buttons mit den Top-Intents
- Option "Alle Optionen" für Action Picker

## Noise Guard

Filtert automatisch:
- Leere Eingaben, Füllwörter ("äh", "ok", "ja")
- Einzelne Zahlen werden als mehrdeutig markiert → Disambiguation

## User Med Lexicon

Korrigiert ASR-Fehler basierend auf User-Medikamenten:
- "suma" → "Sumatriptan 50 mg" (wenn eindeutig)
- Nur bei genau 1 Match, sonst keine Korrektur

## Logs lesen (Dev Mode)

```
[VOICE] ✅ add_medication (85%)
  Transcript: "füge ibuprofen 400 mg hin..."
  Top intents: [{intent: 'add_medication', score: 0.85}, ...]
  Policy: auto_execute (Very high confidence mutation)
  Latency: 23 ms
```

## iOS Dictation Fallback

Wenn Web Speech API nicht verfügbar:
1. Overlay zeigt "Diktier-Modus"
2. User nutzt iOS Keyboard-Mikrofon
3. Mutations erfordern IMMER Bestätigung
