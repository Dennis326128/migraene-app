/**
 * EntryReviewSheet - Reusable pain entry review/edit component
 * 
 * Used by both Voice Input and QuickEntry flows.
 * Shows: PainSlider + MedicationDoseList + Notes textarea + Time display
 * 
 * Migräne-optimiert: große Touch-Targets, wenig visuelles Rauschen, ruhige Typo
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { PainSlider } from '@/components/ui/pain-slider';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SaveButton } from '@/components/ui/save-button';
import { MedicationDoseList } from './MedicationDose';
import { Clock, Mic, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export interface EntryReviewState {
  painLevel: number;
  selectedMedications: Map<string, { doseQuarters: number; medicationId?: string }>;
  notesText: string;
  occurredAt: {
    date: string;    // YYYY-MM-DD
    time: string;    // HH:mm
    displayText?: string;
  };
}

interface MedicationOption {
  id: string;
  name: string;
}

interface RecentMedication {
  id: string;
  name: string;
  use_count: number;
}

export interface EntryReviewSheetProps {
  state: EntryReviewState;
  onChange: (state: EntryReviewState) => void;
  onSave: () => void;
  onDiscard: () => void;
  onRetryVoice?: () => void;
  medications: MedicationOption[];
  recentMedications?: RecentMedication[];
  saving?: boolean;
  emptyTranscript?: boolean;
  /** If true, show a hint that pain was defaulted (not recognized from voice) */
  painDefaultUsed?: boolean;
  /** If true, hide the time display row */
  hideTimeDisplay?: boolean;
  className?: string;
}

// ============================================
// Component
// ============================================

export function EntryReviewSheet({
  state,
  onChange,
  onSave,
  onDiscard,
  onRetryVoice,
  medications,
  recentMedications = [],
  saving = false,
  emptyTranscript = false,
  painDefaultUsed = false,
  hideTimeDisplay = false,
  className,
}: EntryReviewSheetProps) {
  const { t } = useTranslation();

  const handlePainChange = (value: number) => {
    onChange({ ...state, painLevel: value });
  };

  const handleMedsChange = (meds: Map<string, { doseQuarters: number; medicationId?: string }>) => {
    onChange({ ...state, selectedMedications: meds });
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...state, notesText: e.target.value });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Empty transcript hint */}
      {emptyTranscript && (
        <div className="bg-muted/50 rounded-xl p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Nichts verstanden – bitte korrigieren oder nochmal sprechen.
          </p>
        </div>
      )}

      {/* Time display (read-only, hidden by default for voice) */}
      {!hideTimeDisplay && (
        <div className="flex items-center gap-2 px-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {state.occurredAt.displayText || `${state.occurredAt.date}, ${state.occurredAt.time}`}
          </span>
        </div>
      )}

      {/* Pain Level */}
      <Card className="p-4">
        <Label className="text-base font-medium mb-3 block">
          Schmerzstärke
        </Label>
        <PainSlider
          value={state.painLevel}
          onValueChange={handlePainChange}
          disabled={saving}
        />
        {painDefaultUsed && !emptyTranscript && (
          <p className="text-xs text-muted-foreground/60 mt-2 text-center">
            Schmerzstärke nicht erkannt – auf 7 gesetzt
          </p>
        )}
      </Card>

      {/* Medications */}
      {medications.length > 0 && (
        <Card className="p-4">
          <Label className="text-base font-medium mb-3 block">Medikamente</Label>
          <MedicationDoseList
            medications={medications}
            selectedMedications={state.selectedMedications}
            onSelectionChange={handleMedsChange}
            recentMedications={recentMedications}
            showRecent={true}
            disabled={saving}
          />
        </Card>
      )}

      {/* Notes / Sonstiges */}
      <Card className="p-4">
        <Label className="text-base font-medium mb-3 block">Sonstiges</Label>
        <Textarea
          value={state.notesText}
          onChange={handleNotesChange}
          placeholder="Optional: Notiz hinzufügen…"
          className="min-h-[60px] resize-none"
          disabled={saving}
        />
      </Card>

      {/* Action Buttons */}
      <div className="space-y-3 pt-2">
        <SaveButton
          onClick={onSave}
          disabled={saving}
          loading={saving}
          className="w-full h-12 text-base"
        />
        
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onDiscard}
            disabled={saving}
            className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors py-2 px-4"
          >
            Verwerfen
          </button>
          
          {onRetryVoice && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <button
                onClick={onRetryVoice}
                disabled={saving}
                className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors py-2 px-4 flex items-center gap-1"
              >
                <Mic className="h-3.5 w-3.5" />
                Nochmal sprechen
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
