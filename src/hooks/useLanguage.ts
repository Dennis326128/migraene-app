/**
 * useLanguage Hook
 * 
 * Provides language state and controls for the app.
 * Wraps i18n functionality in a React-friendly way.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  getCurrentLanguage, 
  setLanguage as setI18nLanguage,
  hasUserSetLanguage,
  resetToSystemLanguage,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  type SupportedLanguage 
} from '@/lib/i18n/i18n';

export function useLanguage() {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(getCurrentLanguage());
  const [isUserSet, setIsUserSet] = useState(hasUserSetLanguage());

  // Sync state when language changes
  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      const lang = lng?.startsWith('de') ? 'de' : 'en';
      setCurrentLanguage(lang as SupportedLanguage);
      setIsUserSet(hasUserSetLanguage());
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setI18nLanguage(lang, true);
    setCurrentLanguage(lang);
    setIsUserSet(true);
  }, []);

  const resetToSystem = useCallback(() => {
    resetToSystemLanguage();
    setCurrentLanguage(getCurrentLanguage());
    setIsUserSet(false);
  }, []);

  return {
    currentLanguage,
    isUserSet,
    setLanguage,
    resetToSystem,
    languages: SUPPORTED_LANGUAGES,
    languageNames: LANGUAGE_NAMES,
  };
}

export type { SupportedLanguage };
