import { describe, expect, it } from 'vitest';
import { findMedicationDuplicate, type MedicationDuplicateCandidate } from '../medicationDuplicate';

const meds: MedicationDuplicateCandidate[] = [
  { id: 'sum-50', name: 'Sumatriptan 50 mg', strength_value: '50', strength_unit: 'mg', is_active: true },
  { id: 'sum-100', name: 'Sumatriptan 100 mg', strength_value: '100', strength_unit: 'mg', is_active: true },
  { id: 'nara', name: 'Naratriptan 2,5 mg', strength_value: '2.5', strength_unit: 'mg', is_active: true },
  { id: 'vydura', name: 'Vydura 75 mg', strength_value: '75', strength_unit: 'mg', is_active: false, discontinued_at: '2025-01-01T00:00:00.000Z' },
];

describe('findMedicationDuplicate', () => {
  it('finds exact same name and strength regardless of intake type', () => {
    const duplicate = findMedicationDuplicate(meds, {
      name: 'Sumatriptan 50 mg',
      strengthValue: '50',
      strengthUnit: 'mg',
    });

    expect(duplicate?.medication.id).toBe('sum-50');
    expect(duplicate?.isArchived).toBe(false);
  });

  it('allows same name with different strength', () => {
    const duplicate = findMedicationDuplicate(meds, {
      name: 'Sumatriptan 25 mg',
      strengthValue: '25',
      strengthUnit: 'mg',
    });

    expect(duplicate).toBeNull();
  });

  it('finds archived matching medication', () => {
    const duplicate = findMedicationDuplicate(meds, {
      name: 'Vydura 75 mg',
      strengthValue: '75',
      strengthUnit: 'mg',
    }, 'gepant');

    expect(duplicate?.medication.id).toBe('vydura');
    expect(duplicate?.isArchived).toBe(true);
  });

  it('marks missing recognized Triptan/Gepant category for existing medications', () => {
    const duplicate = findMedicationDuplicate(meds, {
      name: 'Naratriptan 2,5 mg',
      strengthValue: '2.5',
      strengthUnit: 'mg',
    }, 'triptan');

    expect(duplicate?.medication.id).toBe('nara');
    expect(duplicate?.hasMissingCategory).toBe(true);
  });
});