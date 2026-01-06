/**
 * Slot Filling Configuration
 * Defines required and optional slots per intent
 */

export type SlotName = 
  | 'medication_name'
  | 'medication_strength'
  | 'medication_unit'
  | 'medication_form'
  | 'pain_level'
  | 'time'
  | 'date'
  | 'reminder_title'
  | 'reminder_type';

export interface SlotDefinition {
  name: SlotName;
  required: boolean;
  prompt: string;
  suggestions: Array<{ label: string; value: string }>;
}

export interface SlotFillingConfig {
  intent: string;
  slots: SlotDefinition[];
}

// ============================================
// Slot Configurations per Intent
// ============================================

export const SLOT_CONFIGS: Record<string, SlotFillingConfig> = {
  add_medication: {
    intent: 'add_medication',
    slots: [
      {
        name: 'medication_name',
        required: true,
        prompt: 'Welches Medikament möchtest du hinzufügen?',
        suggestions: [
          { label: 'Sumatriptan', value: 'sumatriptan' },
          { label: 'Rizatriptan', value: 'rizatriptan' },
          { label: 'Ibuprofen', value: 'ibuprofen' },
          { label: 'Paracetamol', value: 'paracetamol' },
        ],
      },
      {
        name: 'medication_strength',
        required: false,
        prompt: 'Welche Stärke? (optional)',
        suggestions: [
          { label: '50 mg', value: '50' },
          { label: '100 mg', value: '100' },
          { label: '200 mg', value: '200' },
          { label: '400 mg', value: '400' },
          { label: '500 mg', value: '500' },
        ],
      },
    ],
  },
  
  reminder: {
    intent: 'reminder',
    slots: [
      {
        name: 'reminder_type',
        required: true,
        prompt: 'Was für eine Erinnerung?',
        suggestions: [
          { label: 'Medikament', value: 'medication' },
          { label: 'Arzttermin', value: 'appointment' },
          { label: 'Allgemein', value: 'general' },
        ],
      },
      {
        name: 'time',
        required: true,
        prompt: 'Wann soll ich dich erinnern?',
        suggestions: [
          { label: 'Morgen früh', value: 'tomorrow_morning' },
          { label: 'Heute Abend', value: 'today_evening' },
          { label: 'In 1 Stunde', value: 'in_1_hour' },
        ],
      },
    ],
  },
  
  pain_entry: {
    intent: 'pain_entry',
    slots: [
      {
        name: 'pain_level',
        required: false, // Optional - user can set via slider
        prompt: 'Wie stark sind die Schmerzen? (0-10)',
        suggestions: [
          { label: 'Leicht (2-3)', value: '3' },
          { label: 'Mittel (4-5)', value: '5' },
          { label: 'Stark (6-7)', value: '7' },
          { label: 'Sehr stark (8-10)', value: '9' },
        ],
      },
      {
        name: 'time',
        required: false, // Default: jetzt
        prompt: 'Wann war das?',
        suggestions: [
          { label: 'Jetzt', value: 'now' },
          { label: 'Vor 1 Stunde', value: '1h_ago' },
          { label: 'Heute Morgen', value: 'this_morning' },
          { label: 'Gestern', value: 'yesterday' },
        ],
      },
    ],
  },
};

// ============================================
// Slot Filling Logic
// ============================================

export interface FilledSlots {
  medication_name?: string;
  medication_strength?: string | number;
  medication_unit?: string;
  medication_form?: string;
  pain_level?: number;
  time?: string;
  date?: string;
  reminder_title?: string;
  reminder_type?: string;
}

export interface SlotFillingState {
  intent: string;
  filledSlots: FilledSlots;
  missingRequiredSlots: SlotName[];
  currentSlotIndex: number;
  isComplete: boolean;
}

/**
 * Initialize slot filling for an intent
 */
export function initSlotFilling(
  intent: string,
  initialSlots: Partial<FilledSlots> = {}
): SlotFillingState {
  const config = SLOT_CONFIGS[intent];
  
  if (!config) {
    return {
      intent,
      filledSlots: initialSlots as FilledSlots,
      missingRequiredSlots: [],
      currentSlotIndex: 0,
      isComplete: true,
    };
  }
  
  const filledSlots: FilledSlots = { ...initialSlots };
  const missingRequiredSlots: SlotName[] = [];
  
  for (const slot of config.slots) {
    if (slot.required && !filledSlots[slot.name]) {
      missingRequiredSlots.push(slot.name);
    }
  }
  
  return {
    intent,
    filledSlots,
    missingRequiredSlots,
    currentSlotIndex: 0,
    isComplete: missingRequiredSlots.length === 0,
  };
}

/**
 * Get the next slot to fill
 */
export function getNextSlotToFill(state: SlotFillingState): SlotDefinition | null {
  const config = SLOT_CONFIGS[state.intent];
  if (!config || state.isComplete) return null;
  
  if (state.currentSlotIndex >= state.missingRequiredSlots.length) {
    return null;
  }
  
  const slotName = state.missingRequiredSlots[state.currentSlotIndex];
  return config.slots.find(s => s.name === slotName) || null;
}

/**
 * Fill a slot and advance state
 */
export function fillSlot(
  state: SlotFillingState,
  slotName: SlotName,
  value: string | number
): SlotFillingState {
  const newFilledSlots = {
    ...state.filledSlots,
    [slotName]: value,
  };
  
  const newMissing = state.missingRequiredSlots.filter(s => s !== slotName);
  const newIndex = state.currentSlotIndex + 1;
  
  return {
    ...state,
    filledSlots: newFilledSlots,
    missingRequiredSlots: newMissing,
    currentSlotIndex: newIndex,
    isComplete: newMissing.length === 0,
  };
}

/**
 * Convert slot filling state to action payload
 */
export function slotsToPayload(state: SlotFillingState): Record<string, unknown> {
  const { intent, filledSlots } = state;
  
  switch (intent) {
    case 'add_medication':
      return {
        name: filledSlots.medication_name,
        displayName: capitalizeFirst(filledSlots.medication_name || ''),
        strengthValue: filledSlots.medication_strength ? Number(filledSlots.medication_strength) : undefined,
        strengthUnit: filledSlots.medication_unit || 'mg',
        formFactor: filledSlots.medication_form,
        confidence: 0.9, // High confidence when manually filled
      };
      
    case 'reminder':
      return {
        type: filledSlots.reminder_type,
        title: filledSlots.reminder_title,
        time: filledSlots.time,
        date: filledSlots.date,
      };
      
    case 'pain_entry':
      return {
        painLevel: filledSlots.pain_level,
        occurredAt: filledSlots.time,
      };
      
    default:
      return { ...filledSlots } as Record<string, unknown>;
  }
}

function capitalizeFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
