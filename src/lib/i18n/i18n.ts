/**
 * i18n Configuration
 * 
 * Migraine-friendly internationalization setup:
 * - Auto-detects device language on first launch
 * - Persists user preference in localStorage
 * - Falls back to German if key missing
 * - Supports DE and EN
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import de from '@/locales/de.json';
import en from '@/locales/en.json';

// Key for persisting user language choice
export const LANGUAGE_STORAGE_KEY = 'migraene-app-language';
export const LANGUAGE_USER_SET_KEY = 'migraene-app-language-user-set';

// Supported languages
export const SUPPORTED_LANGUAGES = ['de', 'en'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// Language display names
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    
    // Fallback to German (primary language of the app)
    fallbackLng: 'de',
    
    // Only support de and en
    supportedLngs: ['de', 'en'],
    
    // If a key is missing, show fallback language (German)
    returnEmptyString: false,
    
    // Detection options
    detection: {
      // Check localStorage first (user preference), then browser
      order: ['localStorage', 'navigator'],
      
      // Cache user preference in localStorage
      caches: ['localStorage'],
      
      // Custom key for localStorage
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
    
    interpolation: {
      escapeValue: false, // React already escapes
    },
    
    // Debug only in development
    debug: import.meta.env.DEV && false, // Set to true for debugging
  });

/**
 * Change the app language and persist the choice
 */
export const setLanguage = (lang: SupportedLanguage, isUserChoice = true) => {
  i18n.changeLanguage(lang);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  
  if (isUserChoice) {
    localStorage.setItem(LANGUAGE_USER_SET_KEY, 'true');
  }
};

/**
 * Get current language
 */
export const getCurrentLanguage = (): SupportedLanguage => {
  const current = i18n.language;
  if (current?.startsWith('de')) return 'de';
  if (current?.startsWith('en')) return 'en';
  return 'de'; // Default
};

/**
 * Check if user has manually set language
 */
export const hasUserSetLanguage = (): boolean => {
  return localStorage.getItem(LANGUAGE_USER_SET_KEY) === 'true';
};

/**
 * Reset to system language
 */
export const resetToSystemLanguage = () => {
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  localStorage.removeItem(LANGUAGE_USER_SET_KEY);
  
  // Detect from browser
  const browserLang = navigator.language?.toLowerCase();
  const lang: SupportedLanguage = browserLang?.startsWith('de') ? 'de' : 'en';
  i18n.changeLanguage(lang);
};

export default i18n;
