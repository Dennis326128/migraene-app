/**
 * Sanitize error messages to prevent leaking sensitive information
 * Maps technical Supabase/PostgreSQL errors to user-friendly German messages
 */

// Common database error patterns
const ERROR_PATTERNS = {
  // Authentication errors
  INVALID_CREDENTIALS: /invalid (login credentials|email or password)/i,
  EMAIL_NOT_CONFIRMED: /email not confirmed/i,
  USER_ALREADY_EXISTS: /user already (registered|exists)/i,
  WEAK_PASSWORD: /password.*weak/i,
  
  // Database errors
  DUPLICATE_KEY: /duplicate key|unique constraint/i,
  FOREIGN_KEY: /foreign key constraint/i,
  NOT_NULL: /null value|violates not-null/i,
  CHECK_CONSTRAINT: /check constraint/i,
  
  // Network errors
  NETWORK: /network|fetch|connection/i,
  TIMEOUT: /timeout|timed out/i,
  
  // Permission errors
  PERMISSION: /permission|unauthorized|forbidden/i,
  RLS_POLICY: /policy|row level security/i,
  
  // Data validation
  INVALID_INPUT: /invalid input/i,
  DATA_TYPE: /invalid.*type|type.*mismatch/i,
} as const;

/**
 * Sanitizes error messages for safe display to users
 * @param error - Error object or message
 * @returns User-friendly German error message
 */
export function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  
  // Check for specific error patterns
  if (ERROR_PATTERNS.INVALID_CREDENTIALS.test(message)) {
    return "E-Mail oder Passwort ist falsch.";
  }
  
  if (ERROR_PATTERNS.EMAIL_NOT_CONFIRMED.test(message)) {
    return "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.";
  }
  
  if (ERROR_PATTERNS.USER_ALREADY_EXISTS.test(message)) {
    return "Ein Konto mit dieser E-Mail-Adresse existiert bereits.";
  }
  
  if (ERROR_PATTERNS.WEAK_PASSWORD.test(message)) {
    return "Das Passwort ist zu schwach. Bitte wählen Sie ein stärkeres Passwort.";
  }
  
  if (ERROR_PATTERNS.DUPLICATE_KEY.test(message)) {
    return "Dieser Eintrag existiert bereits.";
  }
  
  if (ERROR_PATTERNS.FOREIGN_KEY.test(message)) {
    return "Dieser Eintrag ist mit anderen Daten verknüpft und kann nicht gelöscht werden.";
  }
  
  if (ERROR_PATTERNS.NOT_NULL.test(message)) {
    return "Bitte füllen Sie alle erforderlichen Felder aus.";
  }
  
  if (ERROR_PATTERNS.CHECK_CONSTRAINT.test(message)) {
    return "Ungültige Eingabe. Bitte überprüfen Sie Ihre Daten.";
  }
  
  if (ERROR_PATTERNS.NETWORK.test(message) || ERROR_PATTERNS.TIMEOUT.test(message)) {
    return "Verbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.";
  }
  
  if (ERROR_PATTERNS.PERMISSION.test(message) || ERROR_PATTERNS.RLS_POLICY.test(message)) {
    return "Sie haben keine Berechtigung für diese Aktion.";
  }
  
  if (ERROR_PATTERNS.INVALID_INPUT.test(message) || ERROR_PATTERNS.DATA_TYPE.test(message)) {
    return "Ungültige Eingabe. Bitte überprüfen Sie Ihre Daten.";
  }
  
  // Generic fallback - don't expose technical details
  return "Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.";
}

/**
 * Logs error details for debugging (only in development)
 * @param context - Context where error occurred
 * @param error - Error object
 */
export function logError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, error);
  }
  
  // TODO: In production, send to error tracking service (e.g., Sentry)
  // if (import.meta.env.PROD) {
  //   errorTracker.captureException(error, { context });
  // }
}

/**
 * Combines validation errors into a single message
 * @param errors - Array of error messages
 * @returns Combined error message
 */
export function combineValidationErrors(errors: string[]): string {
  if (errors.length === 0) return "";
  if (errors.length === 1) return errors[0];
  
  return `Folgende Fehler sind aufgetreten:\n${errors.map(e => `• ${e}`).join('\n')}`;
}
