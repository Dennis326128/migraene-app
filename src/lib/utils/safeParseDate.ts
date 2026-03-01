/**
 * Safe date parsing utility.
 * Returns a valid Date or null — never throws.
 */
export function safeParseDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Safe date formatting with fallback.
 * Returns formatted string or fallback (default "-") if date is invalid.
 */
export function safeDateFormat(
  input: string | null | undefined,
  formatter: (date: Date) => string,
  fallback = "-"
): string {
  const d = safeParseDate(input);
  if (!d) return fallback;
  try {
    return formatter(d);
  } catch {
    return fallback;
  }
}
