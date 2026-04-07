/**
 * PDF Filename Utilities
 * Generates consistent filenames across app and doctor-share PDFs.
 *
 * Pattern: Nachname_Vorname_Kopfschmerztagebuch_StartMonat-EndMonat_Jahr.pdf
 * Examples:
 *   - Staudt_Dennis_Kopfschmerztagebuch_Jan-Apr2026.pdf
 *   - Staudt_Dennis_Kopfschmerztagebuch_Jan2026.pdf (single month)
 *   - Staudt_Dennis_Kopfschmerztagebuch_Jan2025-Apr2026.pdf (cross-year)
 */

const DE_MONTHS = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function sanitize(str: string): string {
  return str
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_äöüÄÖÜß-]/g, '')
    .trim();
}

export function buildPdfFilename(opts: {
  lastName?: string;
  firstName?: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string;   // YYYY-MM-DD
  reportType?: 'diary' | 'medication_plan';
}): string {
  const { lastName, firstName, fromDate, toDate, reportType = 'diary' } = opts;

  const from = new Date(fromDate + 'T12:00:00Z');
  const to = new Date(toDate + 'T12:00:00Z');

  const fromMonth = DE_MONTHS[from.getUTCMonth()];
  const fromYear = from.getUTCFullYear();
  const toMonth = DE_MONTHS[to.getUTCMonth()];
  const toYear = to.getUTCFullYear();

  let rangePart: string;
  if (fromMonth === toMonth && fromYear === toYear) {
    // Same month: Jan2026
    rangePart = `${fromMonth}${fromYear}`;
  } else if (fromYear === toYear) {
    // Same year: Jan-Apr2026
    rangePart = `${fromMonth}-${toMonth}${toYear}`;
  } else {
    // Cross-year: Jan2025-Apr2026
    rangePart = `${fromMonth}${fromYear}-${toMonth}${toYear}`;
  }

  const typeLabel = reportType === 'medication_plan' ? 'Medikationsplan' : 'Kopfschmerztagebuch';

  const parts: string[] = [];
  if (lastName) parts.push(sanitize(lastName));
  if (firstName) parts.push(sanitize(firstName));
  parts.push(typeLabel);
  parts.push(rangePart);

  return parts.join('_') + '.pdf';
}

/**
 * Builds the Storage path for cached PDFs (without bucket prefix).
 * Pattern: {userId}/{rangeStart}_{rangeEnd}.pdf
 */
export function buildStoragePath(userId: string, rangeStart: string, rangeEnd: string): string {
  return `${userId}/${rangeStart}_${rangeEnd}.pdf`;
}
