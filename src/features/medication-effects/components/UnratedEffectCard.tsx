import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MedicationEffectSlider } from '@/components/ui/medication-effect-slider';
import { Trash2, CheckCircle } from 'lucide-react';
import { formatRelativeDateTimeLabel } from '@/lib/dateUtils';
import { normalizePainLevel } from '@/lib/utils/pain';
import type { UnratedMedicationEntry } from '../api/medicationEffects.api';
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

/**
 * Extracts known side-effect keywords from free-text observations.
 * Used internally when saving — user sees only one unified text field.
 */
const SIDE_EFFECT_KEYWORDS = [
  'übelkeit', 'müdigkeit', 'müde', 'schwindel', 'kopfschmerzen',
  'magenschmerzen', 'herzrasen', 'schwitzen', 'durchfall',
  'benommenheit', 'benommen', 'sehstörung', 'kribbeln',
  'taubheit', 'erbrechen', 'appetitlosigkeit'
];

const KEYWORD_TO_LABEL: Record<string, string> = {
  'übelkeit': 'Übelkeit',
  'müdigkeit': 'Müdigkeit',
  'müde': 'Müdigkeit',
  'schwindel': 'Schwindel',
  'kopfschmerzen': 'Kopfschmerzen',
  'magenschmerzen': 'Magenschmerzen',
  'herzrasen': 'Herzrasen',
  'schwitzen': 'Schwitzen',
  'durchfall': 'Durchfall',
  'benommenheit': 'Benommenheit',
  'benommen': 'Benommenheit',
  'sehstörung': 'Sehstörung',
  'kribbeln': 'Kribbeln',
  'taubheit': 'Taubheit',
  'erbrechen': 'Erbrechen',
  'appetitlosigkeit': 'Appetitlosigkeit',
};

function extractSideEffectsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const keyword of SIDE_EFFECT_KEYWORDS) {
    if (lower.includes(keyword)) {
      found.add(KEYWORD_TO_LABEL[keyword] || keyword);
    }
  }
  return Array.from(found);
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
  const [observations, setObservations] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const painScore = normalizePainLevel(entry.pain_level);

  const handleSave = () => {
    const extractedSideEffects = extractSideEffectsFromText(observations);
    onSave({
      effectScore,
      sideEffects: extractedSideEffects,
      notes: observations.trim(),
      method: 'ui'
    });
  };

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete(entry.id, medName);
    }
    setShowDeleteDialog(false);
  };

  // Build the date/time display: "Heute · 13:49 Uhr"
  const dateTimeRaw = formatRelativeDateTimeLabel(entry.selected_date, entry.selected_time);
  // Transform "Heute, 13:49" → "Heute · 13:49 Uhr"
  const dateTimeParts = dateTimeRaw.split(', ');
  const dateLabel = dateTimeParts[0];
  const timeLabel = dateTimeParts.length > 1 ? dateTimeParts[1] : null;

  return (
    <>
      <Card className="p-4 space-y-4">
        {/* Header: Med name, date/time, pain context */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-0.5">
            {/* Line 1: Medication Name */}
            <div className="font-semibold text-lg truncate">💊 {medName}</div>
            
            {/* Line 2: Date · Time */}
            <div className="text-sm text-muted-foreground">
              {dateLabel}
              {timeLabel && (
                <>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span className="font-medium text-foreground/80">{timeLabel} Uhr</span>
                </>
              )}
            </div>

            {/* Line 3: Pain before intake */}
            <div className="text-sm text-muted-foreground">
              Schmerz vor Einnahme: {painScore}/10
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

        {/* Slider: Effect Rating (unchanged logic) */}
        <div className="space-y-2">
          <Label className="text-base font-medium">
            Wie gut hat es geholfen?
          </Label>
          <MedicationEffectSlider
            value={effectScore}
            onValueChange={setEffectScore}
            disabled={isSaving || isDeleting}
          />
        </div>

        {/* Unified observations field (notes + side effects merged) */}
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">
            Beobachtungen (optional)
          </Label>
          <Textarea 
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="z. B. Übelkeit, müde, gut vertragen, nach 2 Std wieder Schmerzen …"
            className="text-sm resize-none min-h-[5rem]"
            rows={3}
            disabled={isSaving || isDeleting}
          />
        </div>

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
