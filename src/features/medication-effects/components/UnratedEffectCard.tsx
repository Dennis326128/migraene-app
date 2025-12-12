import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MedicationEffectSlider } from '@/components/ui/medication-effect-slider';
import { EffectVoiceButton } from './EffectVoiceButton';
import { X, CheckCircle, Clock } from 'lucide-react';
import { getEffectLabel, COMMON_SIDE_EFFECTS } from '@/lib/utils/medicationEffects';
import { normalizePainLevel } from '@/lib/utils/pain';
import type { UnratedMedicationEntry } from '../api/medicationEffects.api';
import type { ParsedMedicationEffect } from '@/types/medicationEffect.types';

interface UnratedEffectCardProps {
  entry: UnratedMedicationEntry;
  medName: string;
  onSave: (data: {
    effectScore: number;
    sideEffects: string[];
    notes: string;
    method: 'ui' | 'voice';
  }) => Promise<void>;
  isSaving?: boolean;
}

/** Format date/time to German format: "12.12.2025, 12:05 Uhr" */
function formatGermanDateTime(date: string | null, time: string | null): string {
  if (!date) return '';
  
  // Parse date (expected: YYYY-MM-DD)
  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year}`;
  
  // Format time without seconds
  let formattedTime = '';
  if (time) {
    const timeParts = time.split(':');
    formattedTime = `${timeParts[0]}:${timeParts[1]}`;
  }
  
  return formattedTime ? `${formattedDate}, ${formattedTime} Uhr` : formattedDate;
}

/** Get pain severity level for color coding */
function getPainSeverityLevel(score: number): 'mild' | 'moderate' | 'severe' {
  if (score <= 3) return 'mild';
  if (score <= 6) return 'moderate';
  return 'severe';
}

/** Get pain badge classes based on severity */
function getPainBadgeClasses(level: 'mild' | 'moderate' | 'severe'): string {
  switch (level) {
    case 'mild':
      return 'bg-emerald-800 text-emerald-50 border-emerald-700';
    case 'moderate':
      return 'bg-amber-800 text-amber-50 border-amber-700';
    case 'severe':
      return 'bg-rose-800 text-rose-50 border-rose-700';
  }
}

export function UnratedEffectCard({ 
  entry, 
  medName, 
  onSave, 
  isSaving 
}: UnratedEffectCardProps) {
  const [effectScore, setEffectScore] = useState<number>(0);
  const [sideEffects, setSideEffects] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<'ui' | 'voice'>('ui');
  const [voiceApplied, setVoiceApplied] = useState(false);

  // Normalize pain level to numeric (0-10)
  const painScore = normalizePainLevel(entry.pain_level);
  const painSeverity = getPainSeverityLevel(painScore);

  const handleVoiceResult = (result: ParsedMedicationEffect) => {
    if (result.effectScore !== null) {
      setEffectScore(result.effectScore);
    }
    if (result.sideEffects.length > 0) {
      setSideEffects(result.sideEffects);
    }
    if (result.notesSummary) {
      setNotes(prev => prev ? `${prev}\n\n${result.notesSummary}` : result.notesSummary);
    }
    setMethod('voice');
    setVoiceApplied(true);
    
    // Reset voice applied indicator after 3s
    setTimeout(() => setVoiceApplied(false), 3000);
  };

  const addSideEffect = (effect: string) => {
    if (!sideEffects.includes(effect)) {
      setSideEffects([...sideEffects, effect]);
    }
  };

  const removeSideEffect = (effect: string) => {
    setSideEffects(sideEffects.filter(e => e !== effect));
  };

  const handleSave = () => {
    onSave({
      effectScore,
      sideEffects,
      notes: notes.trim(),
      method
    });
  };

  return (
    <Card className="p-4 space-y-4">
      {/* Entry Info Header */}
      <div className="space-y-2">
        {/* Row 1: Medication Name */}
        <div className="font-medium text-lg">💊 {medName}</div>
        
        {/* Row 2: Pain Badge */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge 
            className={`text-xs border ${getPainBadgeClasses(painSeverity)}`}
          >
            Schmerz {painScore}/10
          </Badge>
        </div>
        
        {/* Row 3: Date/Time */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          {formatGermanDateTime(entry.selected_date, entry.selected_time)}
        </div>
      </div>

      {/* Voice Input Button */}
      <EffectVoiceButton
        entryId={entry.id}
        medName={medName}
        onResult={handleVoiceResult}
        disabled={isSaving}
      />

      {voiceApplied && (
        <Badge variant="outline" className="w-full justify-center text-xs py-1">
          ✓ Eingaben aus Sprache übernommen. Bitte kurz prüfen.
        </Badge>
      )}

      {/* Effect Rating Slider */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Wie gut hat {medName} geholfen?
        </Label>
        <MedicationEffectSlider
          value={effectScore}
          onValueChange={(value) => {
            setEffectScore(value);
            if (method === 'ui' && !voiceApplied) {
              setMethod('ui');
            }
          }}
          disabled={isSaving}
        />
        <div className="text-center text-sm text-muted-foreground">
          Aktuell: {getEffectLabel(effectScore)}
        </div>
      </div>

      {/* Quick "Keine Wirkung" Button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setEffectScore(0)}
        disabled={isSaving}
      >
        ❌ Keine Wirkung
      </Button>

      {/* Side Effects */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Nebenwirkungen (optional)</Label>
        
        {sideEffects.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {sideEffects.map((effect) => (
              <Badge key={effect} variant="secondary" className="text-xs">
                {effect}
                <button 
                  onClick={() => removeSideEffect(effect)}
                  className="ml-1 text-destructive hover:text-destructive/80"
                  disabled={isSaving}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        
        <div className="flex flex-wrap gap-1">
          {COMMON_SIDE_EFFECTS
            .filter(effect => !sideEffects.includes(effect))
            .slice(0, 6)
            .map((effect) => (
            <Button
              key={effect}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => addSideEffect(effect)}
              disabled={isSaving}
            >
              + {effect}
            </Button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Zusätzliche Notizen</Label>
        <Textarea 
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Weitere Details zur Wirkung..."
          className="text-sm resize-none"
          rows={3}
          disabled={isSaving}
        />
      </div>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full"
        size="lg"
      >
        {isSaving ? (
          'Speichert...'
        ) : (
          <>
            <CheckCircle className="w-4 h-4 mr-2" />
            Bewertung speichern
          </>
        )}
      </Button>
    </Card>
  );
}
