/**
 * Language Modal
 * 
 * Centered language selector dialog.
 * One tap → select → done.
 * Active language shown via styling only (no checkmark).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useLanguage, type SupportedLanguage } from '@/hooks/useLanguage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LanguageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LANGUAGE_OPTIONS: { value: SupportedLanguage; label: string }[] = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

export function LanguageModal({ open, onOpenChange }: LanguageModalProps) {
  const { t } = useTranslation();
  const { currentLanguage, setLanguage } = useLanguage();

  const handleSelect = (lang: SupportedLanguage) => {
    if (lang !== currentLanguage) {
      setLanguage(lang);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px] p-0 gap-0 rounded-2xl border-border/50 bg-card shadow-2xl">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle className="text-center text-lg font-medium">
            {t('settings.language')}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-3">
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = currentLanguage === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "w-full h-14 flex items-center justify-center rounded-xl transition-all",
                  "active:scale-[0.98] touch-manipulation",
                  isActive
                    ? "bg-primary/15 ring-2 ring-primary/80 text-primary font-medium"
                    : "bg-muted/30 hover:bg-muted/50 text-foreground/80"
                )}
              >
                <span className="text-lg">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
