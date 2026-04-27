import { normalizeMedicationName } from './classifyMedication';

export type MedicationDuplicateCandidate = {
  id: string;
  name: string;
  staerke?: string | null;
  strength_value?: string | null;
  strength_unit?: string | null;
  einheit?: string | null;
  intake_type?: string | null;
  is_active?: boolean | null;
  discontinued_at?: string | null;
  end_date?: string | null;
  effect_category?: string | null;
};

export type MedicationDuplicateInput = {
  name: string;
  strengthValue?: string | null;
  strengthUnit?: string | null;
};

export type MedicationDuplicateMatch = {
  medication: MedicationDuplicateCandidate;
  isArchived: boolean;
  hasMissingCategory: boolean;
};

const STRENGTH_PATTERN = /(\d+(?:[,.]\d+)?)\s*(mg|µg|g|ml|ie)\b/i;

function normalizeStrengthValue(value?: string | number | null): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(',', '.');
}

function normalizeUnit(unit?: string | null): string {
  return (unit || '').trim().toLowerCase();
}

function extractStrength(text?: string | null): { value: string; unit: string } {
  if (!text) return { value: '', unit: '' };
  const match = text.match(STRENGTH_PATTERN);
  if (!match) return { value: '', unit: '' };
  return {
    value: normalizeStrengthValue(match[1]),
    unit: normalizeUnit(match[2]),
  };
}

function medicationSignature(input: MedicationDuplicateInput | MedicationDuplicateCandidate) {
  const explicitStrength = 'id' in input
    ? { value: normalizeStrengthValue(input.strength_value), unit: normalizeUnit(input.strength_unit) }
    : { value: normalizeStrengthValue(input.strengthValue), unit: normalizeUnit(input.strengthUnit) };
  const fromStaerke = 'staerke' in input ? extractStrength(input.staerke) : { value: '', unit: '' };
  const fromName = extractStrength(input.name);
  const value = explicitStrength.value || fromStaerke.value || fromName.value;
  const unit = explicitStrength.unit || fromStaerke.unit || fromName.unit;
  const nameWithoutStrength = input.name.replace(STRENGTH_PATTERN, '').trim();

  return {
    baseName: normalizeMedicationName(nameWithoutStrength || input.name),
    fullName: normalizeMedicationName(input.name),
    strengthValue: value,
    strengthUnit: unit,
  };
}

export function findMedicationDuplicate(
  medications: MedicationDuplicateCandidate[],
  input: MedicationDuplicateInput,
  detectedCategory?: 'triptan' | 'gepant' | null,
): MedicationDuplicateMatch | null {
  const target = medicationSignature(input);
  if (!target.baseName && !target.fullName) return null;

  const match = medications.find((medication) => {
    const existing = medicationSignature(medication);
    const sameMedicationName = target.baseName === existing.baseName || target.fullName === existing.fullName;
    if (!sameMedicationName) return false;

    if (target.strengthValue || existing.strengthValue) {
      return target.strengthValue === existing.strengthValue && target.strengthUnit === existing.strengthUnit;
    }

    return target.fullName === existing.fullName;
  });

  if (!match) return null;

  return {
    medication: match,
    isArchived: match.is_active === false || Boolean(match.discontinued_at) || Boolean(match.end_date),
    hasMissingCategory: Boolean(detectedCategory) && !match.effect_category,
  };
}