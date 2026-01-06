/**
 * Slot Filling Tests
 */

import { describe, it, expect } from 'vitest';
import { initSlotFilling, getNextSlotToFill, fillSlot, slotsToPayload, SLOT_CONFIGS } from '../slotFilling';

describe('Slot Filling', () => {
  describe('initSlotFilling', () => {
    it('initializes with missing required slots for add_medication', () => {
      const state = initSlotFilling('add_medication');
      
      expect(state.intent).toBe('add_medication');
      expect(state.missingRequiredSlots).toContain('medication_name');
      expect(state.isComplete).toBe(false);
    });

    it('skips already filled slots', () => {
      const state = initSlotFilling('add_medication', {
        medication_name: 'Ibuprofen',
      });
      
      expect(state.missingRequiredSlots).not.toContain('medication_name');
      expect(state.isComplete).toBe(true);
    });

    it('handles unknown intent gracefully', () => {
      const state = initSlotFilling('unknown_intent');
      
      expect(state.isComplete).toBe(true);
      expect(state.missingRequiredSlots.length).toBe(0);
    });
  });

  describe('getNextSlotToFill', () => {
    it('returns the next missing slot', () => {
      const state = initSlotFilling('add_medication');
      const nextSlot = getNextSlotToFill(state);
      
      expect(nextSlot).not.toBeNull();
      expect(nextSlot?.name).toBe('medication_name');
      expect(nextSlot?.prompt).toBeTruthy();
      expect(nextSlot?.suggestions.length).toBeGreaterThan(0);
    });

    it('returns null when complete', () => {
      const state = initSlotFilling('add_medication', {
        medication_name: 'Ibuprofen',
      });
      const nextSlot = getNextSlotToFill(state);
      
      expect(nextSlot).toBeNull();
    });
  });

  describe('fillSlot', () => {
    it('fills a slot and updates state', () => {
      const state = initSlotFilling('add_medication');
      const newState = fillSlot(state, 'medication_name', 'Sumatriptan');
      
      expect(newState.filledSlots.medication_name).toBe('Sumatriptan');
      expect(newState.missingRequiredSlots).not.toContain('medication_name');
      expect(newState.isComplete).toBe(true);
    });

    it('advances to next slot when more slots needed', () => {
      const state = initSlotFilling('reminder');
      expect(state.isComplete).toBe(false);
      
      const state2 = fillSlot(state, 'reminder_type', 'medication');
      expect(state2.isComplete).toBe(false);
      
      const state3 = fillSlot(state2, 'time', 'tomorrow_morning');
      expect(state3.isComplete).toBe(true);
    });
  });

  describe('slotsToPayload', () => {
    it('converts add_medication slots to payload', () => {
      const state = initSlotFilling('add_medication', {
        medication_name: 'ibuprofen',
        medication_strength: 400,
      });
      const payload = slotsToPayload(state);
      
      expect(payload.name).toBe('ibuprofen');
      expect(payload.displayName).toBe('Ibuprofen');
      expect(payload.strengthValue).toBe(400);
      expect(payload.strengthUnit).toBe('mg');
    });
  });

  describe('SLOT_CONFIGS', () => {
    it('has config for add_medication', () => {
      expect(SLOT_CONFIGS.add_medication).toBeDefined();
      expect(SLOT_CONFIGS.add_medication.slots.length).toBeGreaterThan(0);
    });

    it('has config for reminder', () => {
      expect(SLOT_CONFIGS.reminder).toBeDefined();
    });

    it('has config for pain_entry', () => {
      expect(SLOT_CONFIGS.pain_entry).toBeDefined();
    });
  });
});
