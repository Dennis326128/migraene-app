/**
 * Dose Formatter Utilities
 * Converts dose_quarters to human-readable fractions
 */

/**
 * Converts dose_quarters to display string
 * @param quarters - Number of quarter tablets (1-32)
 * @returns Formatted string like "½", "1", "1½", etc.
 */
export function formatDoseFromQuarters(quarters: number): string {
  if (quarters <= 0) return "0";
  
  const whole = Math.floor(quarters / 4);
  const remainder = quarters % 4;
  
  const fractionMap: Record<number, string> = {
    0: "",
    1: "¼",
    2: "½",
    3: "¾",
  };
  
  const fraction = fractionMap[remainder] || "";
  
  if (whole === 0) {
    return fraction || "0";
  }
  
  if (fraction) {
    return `${whole}${fraction}`;
  }
  
  return whole.toString();
}

/**
 * Converts dose_quarters to display string with "Tbl" suffix
 * @param quarters - Number of quarter tablets (1-32)
 * @returns Formatted string like "½ Tbl", "1 Tbl", "1½ Tbl", etc.
 */
export function formatDoseWithUnit(quarters: number): string {
  const dose = formatDoseFromQuarters(quarters);
  return `${dose} Tbl`;
}

/**
 * Converts dose_quarters to decimal value (for calculations)
 * @param quarters - Number of quarter tablets
 * @returns Decimal value (e.g., 4 -> 1.0, 6 -> 1.5)
 */
export function quartersToDecimal(quarters: number): number {
  return quarters / 4;
}

/**
 * Converts decimal dose to quarters
 * @param decimal - Decimal dose (e.g., 0.5, 1.25)
 * @returns Number of quarters
 */
export function decimalToQuarters(decimal: number): number {
  return Math.round(decimal * 4);
}

/**
 * Quick dose options for the dose selector
 */
export const DOSE_QUICK_OPTIONS = [
  { quarters: 1, label: "¼" },
  { quarters: 2, label: "½" },
  { quarters: 3, label: "¾" },
  { quarters: 4, label: "1" },
  { quarters: 6, label: "1½" },
  { quarters: 8, label: "2" },
] as const;

/**
 * Default dose in quarters (1 tablet)
 */
export const DEFAULT_DOSE_QUARTERS = 4;

/**
 * Minimum dose in quarters (¼ tablet)
 */
export const MIN_DOSE_QUARTERS = 1;

/**
 * Maximum dose in quarters (8 tablets)
 */
export const MAX_DOSE_QUARTERS = 32;
