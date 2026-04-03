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
import { SaveButton } from '@/components/ui/save-button';
import { MedicationDoseList } from './MedicationDose';
import { Clock, Mic, ChevronDown, AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// ============================================
// Uncertainty Indicator Helper
// ============================================

function getFieldWarning(field: string, uncertainFields?: ReviewUncertainField[]) {
  if (!uncertainFields) return null;
  return uncertainFields.find(f => f.field === field) ?? null;
}

function UncertaintyHint({ warning }: { warning: ReviewUncertainField | null }) {
  if (!warning) return null;
  
  if (warning.confidence < 0.65) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning ml-1.5">
        <AlertTriangle className="h-3 w-3" />
        Bitte prüfen
      </span>
    );
  }
  
  if (warning.confidence < 0.80) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/50 ml-1.5">
        <HelpCircle className="h-3 w-3" />
      </span>
    );
  }
  
  return null;
}

// ============================================
// Types
// ============================================

export interface ReviewUncertainField {
  field: string;
  label: string;
  value: string;
  confidence: number;
  tapToEdit: boolean;
}

export interface EntryReviewState {
  painLevel: number;
  selectedMedications: Map<string, { doseQuarters: number; medicationId?: string }>;
  notesText: string;
  occurredAt: {
    date: string;    // YYYY-MM-DD
    time: string;    // HH:mm
    displayText?: string;
  };
  // New voice parser fields (optional for backward compat)
  painLocations?: string[];
  auraType?: string;
  symptoms?: string[];
  meCfsLevel?: string;
  isPrivate?: boolean;
  uncertainFields?: ReviewUncertainField[];
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
  /** Callback for "Weiter sprechen" append mode */
  onContinueSpeaking?: () => void;
  medications: MedicationOption[];
  recentMedications?: RecentMedication[];
  saving?: boolean;
  emptyTranscript?: boolean;
  /** If true, show a hint that pain was defaulted (not recognized from voice) */
  painDefaultUsed?: boolean;
  /** If true, show a hint that pain was estimated from descriptive words */
  painFromDescriptor?: boolean;
  /** If true, show a hint to review medication selection */
  medsNeedReview?: boolean;
  /** If true, hide the time display row */
  hideTimeDisplay?: boolean;
  /** Raw transcript to display in collapsible "Gesagt (Original)" section */
  rawTranscript?: string;
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
  onContinueSpeaking,
  medications,
  recentMedications = [],
  saving = false,
  emptyTranscript = false,
  painDefaultUsed = false,
  painFromDescriptor = false,
  medsNeedReview = false,
  hideTimeDisplay = false,
  rawTranscript,
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
      <Card className={cn("p-4", getFieldWarning('painLevel', state.uncertainFields)?.confidence !== undefined && getFieldWarning('painLevel', state.uncertainFields)!.confidence < 0.65 && "ring-1 ring-warning/30")}>
        <Label className="text-base font-medium mb-3 block">
          Schmerzstärke
          <UncertaintyHint warning={getFieldWarning('painLevel', state.uncertainFields)} />
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
        {painFromDescriptor && !painDefaultUsed && !emptyTranscript && (
          <p className="text-xs text-muted-foreground/60 mt-2 text-center">
            Aus Beschreibung geschätzt – bitte kurz prüfen
          </p>
        )}
      </Card>

      {/* Medications */}
      {medications.length > 0 && (
        <Card className="p-4">
          <Label className="text-base font-medium mb-3 block">Medikamente</Label>
          {medsNeedReview && (
            <p className="text-xs text-muted-foreground/60 mb-2">
              Bitte kurz prüfen – ähnlich klingende Medikamente möglich.
            </p>
          )}
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

      {/* Original Transcript (collapsible, trust-building) */}
      {rawTranscript && rawTranscript.trim().length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors w-full group">
            <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
            <span>Gesagt (Original)</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-1 pb-2">
              <p className="text-xs text-muted-foreground/40 italic leading-relaxed">
                „{rawTranscript}"
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Action Buttons */}
      <div className="space-y-3 pt-2">
        <SaveButton
          onClick={onSave}
          disabled={saving}
          loading={saving}
          className="w-full h-12 text-base"
        />
        
        {/* "Weiter sprechen" button - secondary but visible */}
        {onContinueSpeaking && (
          <Button
            variant="outline"
            onClick={onContinueSpeaking}
            disabled={saving}
            className="w-full h-11 text-sm gap-2"
          >
            <Mic className="h-4 w-4" />
            Weiter sprechen
          </Button>
        )}

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onDiscard}
            disabled={saving}
            className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors py-2 px-4"
          >
            Verwerfen
          </button>
          
          {onRetryVoice && !onContinueSpeaking && (
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
