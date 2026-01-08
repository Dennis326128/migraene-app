import { toast as sonnerToast } from 'sonner';
import { sanitizeToastText } from '@/lib/toast/sanitizeToastText';

/**
 * Unified toast helpers for consistent, non-blocking notifications.
 * 
 * Design principles:
 * - Erfolgsmeldungen: dezent, auto-dismiss nach 2s, keine Interaktion nötig
 * - Fehlermeldungen: länger sichtbar (4-5s), aber nicht blockierend
 * - Keine Close-Buttons bei Erfolg
 * - Position: oben zentriert, unter Header
 * - Automatische Entfernung von Status-Emojis (verhindert Doppel-Icons)
 */

export const showSuccessToast = (title: string, description?: string) => {
  sonnerToast.success(sanitizeToastText(title) || title, { 
    description: sanitizeToastText(description),
    duration: 2000,
    closeButton: false,
  });
};

export const showErrorToast = (title: string, description?: string) => {
  sonnerToast.error(sanitizeToastText(title) || title, { 
    description: sanitizeToastText(description),
    duration: 5000, // Fehler länger sichtbar
    closeButton: false, // Trotzdem nicht manuell schließen
  });
};

export const showInfoToast = (title: string, description?: string) => {
  sonnerToast.info(sanitizeToastText(title) || title, { 
    description: sanitizeToastText(description),
    duration: 3000,
    closeButton: false,
  });
};

export const showWarningToast = (title: string, description?: string) => {
  sonnerToast.warning(sanitizeToastText(title) || title, { 
    description: sanitizeToastText(description),
    duration: 4000,
    closeButton: false,
  });
};

/**
 * Zeigt einen schnellen Erfolgstoast ohne Beschreibung
 * Ideal für "Gespeichert", "Gelöscht" etc.
 */
export const showQuickSuccess = (message: string) => {
  sonnerToast.success(sanitizeToastText(message) || message, {
    duration: 1500,
    closeButton: false,
  });
};
