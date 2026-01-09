/**
 * German-friendly date range formatter for KI-Musteranalyse
 * Formats dates in user-friendly German style: "9. Jan – 11. Feb 2025"
 */

const GERMAN_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'
];

/**
 * Formats a single date in German style: "9. Jan 2025"
 * @param date - Date to format
 * @param includeYear - Whether to include the year
 */
export function formatDateDE(date: Date | string, includeYear = true): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return 'Ungültiges Datum';
  }
  
  const day = d.getDate(); // No leading zero
  const month = GERMAN_MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  
  if (includeYear) {
    return `${day}. ${month} ${year}`;
  }
  return `${day}. ${month}`;
}

/**
 * Formats a date range in German style
 * - Same year: "9. Jan – 11. Feb 2025"
 * - Different years: "20. Dez 2024 – 10. Jan 2025"
 * 
 * @param from - Start date
 * @param to - End date
 */
export function formatDateRangeDE(from: Date | string, to: Date | string): string {
  const fromDate = typeof from === 'string' ? new Date(from) : from;
  const toDate = typeof to === 'string' ? new Date(to) : to;
  
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return 'Ungültiger Zeitraum';
  }
  
  const sameYear = fromDate.getFullYear() === toDate.getFullYear();
  
  if (sameYear) {
    // Same year: show year only at the end
    const fromFormatted = formatDateDE(fromDate, false);
    const toFormatted = formatDateDE(toDate, true);
    return `${fromFormatted} – ${toFormatted}`;
  } else {
    // Different years: show both years
    const fromFormatted = formatDateDE(fromDate, true);
    const toFormatted = formatDateDE(toDate, true);
    return `${fromFormatted} – ${toFormatted}`;
  }
}

/**
 * Smart number formatter with max 2 decimal places
 * - Whole numbers: no decimals (8 instead of 8.00)
 * - Decimals: max 2 places (6.23)
 * - Percentages: add % suffix
 * - Multipliers: add × suffix
 * 
 * @param value - Number to format
 * @param options - Formatting options
 */
export function formatNumberSmart(
  value: number | string | undefined | null,
  options: {
    type?: 'default' | 'percent' | 'multiplier';
    maxDecimals?: number;
  } = {}
): string {
  const { type = 'default', maxDecimals = 2 } = options;
  
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '–';
  }
  
  // Parse string to number if needed
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  // Handle NaN
  if (isNaN(num)) {
    return '–';
  }
  
  // Round to max decimal places
  const rounded = Math.round(num * Math.pow(10, maxDecimals)) / Math.pow(10, maxDecimals);
  
  // Format: remove trailing zeros
  let formatted: string;
  if (Number.isInteger(rounded)) {
    formatted = rounded.toString();
  } else {
    // toFixed and then remove trailing zeros
    formatted = rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
  }
  
  // Add suffix based on type
  switch (type) {
    case 'percent':
      return `${formatted} %`;
    case 'multiplier':
      return `${formatted}×`;
    default:
      return formatted;
  }
}

/**
 * Formats a timestamp for "last updated" display
 * @param date - Date to format
 */
export function formatLastUpdated(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return '';
  }
  
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  
  return `${formatDateDE(d, true)} um ${hours}:${minutes} Uhr`;
}
