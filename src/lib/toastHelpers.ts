import { toast as sonnerToast } from 'sonner';
import { sanitizeToastText } from '@/lib/toast/sanitizeToastText';

/**
 * Migräne-freundliche Toast-Helfer
 * 
 * Design-Prinzipien:
 * - Längere Anzeigedauer für bessere Lesbarkeit bei Kopfschmerzen
 * - Gedämpfte, ruhige Farben (keine grellen/leuchtenden Töne)
 * - Keine alarmierenden Texte oder Ausrufezeichen
 * - Sanftes Ein-/Ausblenden
 * - Position: oben zentriert, unter Header
 */

export const showSuccessToast = (title: string, description?: string) => {
  sonnerToast.success(sanitizeToastText(title) || title, { 
    description: sanitizeToastText(description),
    duration: 3000, // Länger für Migräne-Nutzer
    closeButton: false,
  });
};

export const showErrorToast = (title: string, description?: string) => {
  sonnerToast.error(sanitizeToastText(title) || title, { 
    description: sanitizeToastText(description),
    duration: 6000, // Fehler deutlich länger sichtbar
    closeButton: false,
  });
};

export const showInfoToast = (title: string, description?: string) => {
  sonnerToast.info(sanitizeToastText(title) || title, { 
    description: sanitizeToastText(description),
    duration: 4000,
    closeButton: false,
  });
};

export const showWarningToast = (title: string, description?: string) => {
  sonnerToast.warning(sanitizeToastText(title) || title, { 
    description: sanitizeToastText(description),
    duration: 5000,
    closeButton: false,
  });
};

/**
 * Zeigt einen kurzen Erfolgstoast ohne Beschreibung
 * Ideal für "Gespeichert", "Gelöscht" etc.
 */
export const showQuickSuccess = (message: string) => {
  sonnerToast.success(sanitizeToastText(message) || message, {
    duration: 2500, // Etwas länger als vorher
    closeButton: false,
  });
};
