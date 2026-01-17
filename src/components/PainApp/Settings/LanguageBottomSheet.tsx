/**
 * Language Bottom Sheet
 * 
 * Simple language switcher as a bottom sheet.
 * One tap → select → done. Minimal reading, minimal steps.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage, type SupportedLanguage } from '@/hooks/useLanguage';
import { toast } from '@/hooks/use-toast';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface LanguageBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LANGUAGE_OPTIONS: { value: SupportedLanguage; label: string; flag: string }[] = [
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
];

export function LanguageBottomSheet({ open, onOpenChange }: LanguageBottomSheetProps) {
  const { t } = useTranslation();
  const { currentLanguage, setLanguage } = useLanguage();

  const handleSelect = (lang: SupportedLanguage) => {
    if (lang !== currentLanguage) {
      setLanguage(lang);
      // Show confirmation toast in the NEW language
      const message = lang === 'de' ? 'Sprache geändert' : 'Language changed';
      toast({ title: message });
    }
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="pb-8">
        <DrawerHeader className="text-left pb-2">
          <DrawerTitle>{t('settings.language')}</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 space-y-2">
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = currentLanguage === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl transition-all",
                  "active:scale-[0.98] touch-manipulation",
                  isActive
                    ? "bg-primary/10 border-2 border-primary"
                    : "bg-muted/50 border-2 border-transparent hover:bg-muted"
                )}
              >
                <span className="text-2xl">{option.flag}</span>
                <span className={cn(
                  "flex-1 text-left text-lg",
                  isActive && "font-medium"
                )}>
                  {option.label}
                </span>
                {isActive && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
