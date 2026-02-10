/**
 * mergeVoiceAppend - Pure merge function for Voice "Weiter sprechen" append logic
 * 
 * Respects userEdited flags: if user manually changed a field in the review sheet,
 * the append will NOT overwrite that field.
 */

import { type EntryReviewState } from '@/components/PainApp/EntryReviewSheet';
import { type VoiceParseResult } from '@/lib/voice/simpleVoiceParser';
import { DEFAULT_DOSE_QUARTERS } from '@/lib/utils/doseFormatter';

export interface UserEditedFlags {
  pain: boolean;
  meds: boolean;
  notes: boolean;
}

/**
 * Merge a new voice append parse result into the existing review state.
 * 
 * Rules:
 * - painLevel: overwrite ONLY if new parse found a pain value AND user hasn't manually edited
 * - medications: add new meds (union), keep user edits if flagged
 * - notes: if user edited, append new note as paragraph; otherwise replace with cleaned note
 * - occurredAt: unchanged
 */
export function mergeVoiceAppend(
  previousState: EntryReviewState,
  newParseResult: VoiceParseResult,
  userEdited: UserEditedFlags,
): { state: EntryReviewState; painDefaultUsed: boolean } {
  // --- Pain Level ---
  let painLevel = previousState.painLevel;
  let painDefaultUsed = newParseResult.pain_intensity.value === null;
  
  if (newParseResult.pain_intensity.value !== null && !userEdited.pain) {
    painLevel = newParseResult.pain_intensity.value;
    painDefaultUsed = false;
  }

  // --- Medications ---
  const selectedMeds = new Map(previousState.selectedMedications);
  
  if (!userEdited.meds) {
    // Add new meds from parse, overwrite doses for existing
    for (const med of newParseResult.medications) {
      selectedMeds.set(med.name, {
        doseQuarters: med.doseQuarters || DEFAULT_DOSE_QUARTERS,
        medicationId: med.medicationId,
      });
    }
  } else {
    // User edited meds: only ADD truly new ones (don't overwrite existing)
    for (const med of newParseResult.medications) {
      if (!selectedMeds.has(med.name)) {
        selectedMeds.set(med.name, {
          doseQuarters: med.doseQuarters || DEFAULT_DOSE_QUARTERS,
          medicationId: med.medicationId,
        });
      }
    }
  }

  // --- Notes ---
  let notesText = previousState.notesText;
  const newNote = newParseResult.note || '';

  if (userEdited.notes) {
    // User manually edited: append new note as new paragraph (if non-empty)
    if (newNote.trim()) {
      notesText = notesText.trim()
        ? `${notesText.trim()}\n\n${newNote.trim()}`
        : newNote.trim();
    }
  } else {
    // Not user-edited: replace with cleaned note from combined transcript
    notesText = newNote;
  }

  return {
    state: {
      ...previousState,
      painLevel,
      selectedMedications: selectedMeds,
      notesText,
    },
    painDefaultUsed,
  };
}
