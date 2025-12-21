import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MedicationEffectSlider } from '@/components/ui/medication-effect-slider';
import { EffectVoiceButton } from './EffectVoiceButton';
import { 
  Trash2, 
  CheckCircle, 
  Clock, 
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { COMMON_SIDE_EFFECTS } from '@/lib/utils/medicationEffects';
import { normalizePainLevel } from '@/lib/utils/pain';
import type { UnratedMedicationEntry } from '../api/medicationEffects.api';
import type { ParsedMedicationEffect } from '@/types/medicationEffect.types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface UnratedEffectCardProps {
  entry: UnratedMedicationEntry;
  medName: string;
  onSave: (data: {
    effectScore: number;
    sideEffects: string[];
    notes: string;
    method: 'ui' | 'voice';
  }) => Promise<void>;
  onDelete?: (entryId: number, medName: string) => Promise<void>;
  isSaving?: boolean;
  isDeleting?: boolean;
}

/** Format date/time to German format: "12.12.2025, 12:05" */
function formatGermanDateTime(date: string | null, time: string | null): string {
  if (!date) return '';
  
  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year}`;
  
  let formattedTime = '';
  if (time) {
    const timeParts = time.split(':');
    formattedTime = `${timeParts[0]}:${timeParts[1]}`;
  }
  
  return formattedTime ? `${formattedDate}, ${formattedTime}` : formattedDate;
}

/** Get pain severity level for color coding */
function getPainSeverityLevel(score: number): 'mild' | 'moderate' | 'severe' {
  if (score <= 3) return 'mild';
  if (score <= 6) return 'moderate';
  return 'severe';
}

/** Get pain dot color based on severity */
function getPainDotColor(level: 'mild' | 'moderate' | 'severe'): string {
  switch (level) {
    case 'mild': return 'bg-emerald-400';
    case 'moderate': return 'bg-amber-400';
    case 'severe': return 'bg-rose-400';
  }
}

export function UnratedEffectCard({ 
  entry, 
  medName, 
  onSave,
  onDelete,
  isSaving,
  isDeleting
}: UnratedEffectCardProps) {
  const [effectScore, setEffectScore] = useState<number>(0);
  const [sideEffects, setSideEffects] = useState<string[]>([]);
  const [noSideEffects, setNoSideEffects] = useState(false);
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<'ui' | 'voice'>('ui');
  const [voiceApplied, setVoiceApplied] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSideEffectsOpen, setIsSideEffectsOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  const painScore = normalizePainLevel(entry.pain_level);
  const painSeverity = getPainSeverityLevel(painScore);

  const handleVoiceResult = (result: ParsedMedicationEffect) => {
    if (result.effectScore !== null) {
      // Convert 0-10 voice result to 0-5 scale
      const newScore = Math.round(result.effectScore / 2);
      setEffectScore(Math.min(5, Math.max(0, newScore)));
    }
    if (result.sideEffects.length > 0) {
      setSideEffects(result.sideEffects);
      setNoSideEffects(false);
      setIsSideEffectsOpen(true);
    }
    if (result.notesSummary) {
      setNotes(prev => prev ? `${prev}\n${result.notesSummary}` : result.notesSummary);
      setIsNotesOpen(true);
    }
    setMethod('voice');
    setVoiceApplied(true);
    setTimeout(() => setVoiceApplied(false), 3000);
  };

  const toggleSideEffect = (effect: string) => {
    if (sideEffects.includes(effect)) {
      setSideEffects(sideEffects.filter(e => e !== effect));
    } else {
      setSideEffects([...sideEffects, effect]);
      setNoSideEffects(false);
    }
  };

  const handleNoSideEffectsToggle = () => {
    if (!noSideEffects) {
      setSideEffects([]);
      setNoSideEffects(true);
    } else {
      setNoSideEffects(false);
    }
  };

  const handleSave = () => {
    onSave({
      effectScore,
      sideEffects: noSideEffects ? [] : sideEffects,
      notes: notes.trim(),
      method
    });
  };

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete(entry.id, medName);
    }
    setShowDeleteDialog(false);
  };

  const hasSideEffectsOrNotes = sideEffects.length > 0 || notes.trim().length > 0;

  return (
    <>
      <Card className="p-4 space-y-4">
        {/* Compact Header with Menu */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Medication Name + Dose */}
            <div className="font-semibold text-lg truncate">💊 {medName}</div>
            
            {/* Date/Time + Pain level inline */}
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{formatGermanDateTime(entry.selected_date, entry.selected_time)}</span>
              <span className="text-muted-foreground/50">•</span>
              <div className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${getPainDotColor(painSeverity)}`} />
                <span>Schmerz {painScore}/10</span>
              </div>
            </div>
          </div>

          {/* Delete Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isDeleting}
            aria-label="Einnahme löschen"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Main: Effect Rating */}
        <div className="space-y-2">
          <Label className="text-base font-medium">
            Wie gut hat es geholfen?
          </Label>
          <MedicationEffectSlider
            value={effectScore}
            onValueChange={(value) => {
              setEffectScore(value);
              if (!voiceApplied) setMethod('ui');
            }}
            disabled={isSaving || isDeleting}
          />
        </div>

        {/* Voice Input - compact */}
        <EffectVoiceButton
          entryId={entry.id}
          medName={medName}
          onResult={handleVoiceResult}
          disabled={isSaving || isDeleting}
        />

        {voiceApplied && (
          <Badge variant="outline" className="w-full justify-center text-xs py-1">
            ✓ Spracheingabe übernommen
          </Badge>
        )}

        {/* Collapsible: Side Effects */}
        <Collapsible open={isSideEffectsOpen} onOpenChange={setIsSideEffectsOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between h-auto py-2 px-3 hover:bg-muted/50"
            >
              <span className="text-sm font-medium">
                Nebenwirkungen {sideEffects.length > 0 && `(${sideEffects.length})`}
              </span>
              {isSideEffectsOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {/* "Keine Nebenwirkungen" Toggle */}
            <Button
              type="button"
              variant={noSideEffects ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={handleNoSideEffectsToggle}
              disabled={isSaving || isDeleting}
            >
              {noSideEffects ? "✓ " : ""}Keine Nebenwirkungen
            </Button>

            {/* Selected side effects */}
            {sideEffects.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sideEffects.map((effect) => (
                  <Badge key={effect} variant="secondary" className="text-xs pr-1">
                    {effect}
                    <button 
                      onClick={() => toggleSideEffect(effect)}
                      className="ml-1 hover:text-destructive"
                      disabled={isSaving || isDeleting}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            
            {/* Available side effects chips */}
            {!noSideEffects && (
              <div className="flex flex-wrap gap-1">
                {COMMON_SIDE_EFFECTS
                  .filter(effect => !sideEffects.includes(effect))
                  .slice(0, 8)
                  .map((effect) => (
                    <Button
                      key={effect}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => toggleSideEffect(effect)}
                      disabled={isSaving || isDeleting}
                    >
                      + {effect}
                    </Button>
                  ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Collapsible: Notes */}
        <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between h-auto py-2 px-3 hover:bg-muted/50"
            >
              <span className="text-sm font-medium">
                Notizen {notes.trim() && "(vorhanden)"}
              </span>
              {isNotesOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Weitere Details..."
              className="text-sm resize-none"
              rows={2}
              disabled={isSaving || isDeleting}
            />
          </CollapsibleContent>
        </Collapsible>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving || isDeleting}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Einnahme wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dadurch wird die Einnahme von <strong>{medName}</strong> aus dem Tagebuch entfernt.
              Diese Aktion kann rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Löscht...' : 'Löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
