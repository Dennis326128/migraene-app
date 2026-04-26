export interface MedicationClass {
  normalizedName: string;
  isTriptan: boolean;
  isGepant: boolean;
  isSpecificMigraineAcute: boolean;
  isAnyMedication: boolean;
  matchedBy: string;
}

export const TRIPTAN_WIRKSTOFFE = [
  'sumatriptan', 'rizatriptan', 'zolmitriptan', 'naratriptan',
  'almotriptan', 'eletriptan', 'frovatriptan',
] as const;

export const TRIPTAN_HANDELSNAMEN = [
  'imigran', 'maxalt', 'ascotop', 'zomig', 'naramig', 'almogran',
  'relpax', 'allegro', 'frova', 'dolotriptan', 'formigran', 'sumavel',
] as const;

export const GEPANT_KEYWORDS = [
  'vydura', 'nurtec', 'rimegepant', 'atogepant', 'ubrogepant',
  'zavegepant', 'qulipta', 'ubrelvy', 'zavzpret',
] as const;

export const ALL_TRIPTAN_KEYWORDS = [...TRIPTAN_WIRKSTOFFE, ...TRIPTAN_HANDELSNAMEN] as const;

export function normalizeMedicationName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

export function isGepant(medName: string | null | undefined): boolean {
  if (!medName) return false;
  const normalizedName = normalizeMedicationName(medName);
  return normalizedName.length > 0 && GEPANT_KEYWORDS.some(keyword => normalizedName.includes(keyword));
}

export function isTriptan(medName: string | null | undefined): boolean {
  if (!medName || isGepant(medName)) return false;
  const normalizedName = normalizeMedicationName(medName);
  if (!normalizedName) return false;
  if (normalizedName.includes('triptan')) return true;
  return ALL_TRIPTAN_KEYWORDS.some(keyword => normalizedName.includes(keyword));
}

export function classifyMedication(medName: string | null | undefined): MedicationClass {
  const normalizedName = medName ? normalizeMedicationName(medName) : '';
  const anyMedication = normalizedName.length > 0;
  const gepant = isGepant(medName);
  const triptan = isTriptan(medName);
  const matchedBy = triptan ? 'triptan' : gepant ? 'gepant' : anyMedication ? 'any-medication' : 'none';

  return {
    normalizedName,
    isTriptan: triptan,
    isGepant: gepant,
    isSpecificMigraineAcute: triptan || gepant,
    isAnyMedication: anyMedication,
    matchedBy,
  };
}

export const isTriptanMedication = isTriptan;