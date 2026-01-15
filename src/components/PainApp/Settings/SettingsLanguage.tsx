/**
 * Language Settings Component
 * 
 * Simple language switcher for Settings page.
 * - Dropdown with DE/EN options
 * - Optional "use device language" button
 * - Persists choice immediately
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe, RotateCcw } from 'lucide-react';
import { useLanguage, type SupportedLanguage } from '@/hooks/useLanguage';

export function SettingsLanguage() {
  const { t } = useTranslation();
  const { 
    currentLanguage, 
    isUserSet, 
    setLanguage, 
    resetToSystem,
    languageNames 
  } = useLanguage();

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium">{t('settings.language')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('settings.languageHint')}
            </p>
          </div>
        </div>

        <Select
          value={currentLanguage}
          onValueChange={(value) => setLanguage(value as SupportedLanguage)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('settings.language')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="de">
              <span className="flex items-center gap-2">
                🇩🇪 {languageNames.de}
              </span>
            </SelectItem>
            <SelectItem value="en">
              <span className="flex items-center gap-2">
                🇬🇧 {languageNames.en}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {isUserSet && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToSystem}
            className="w-full text-muted-foreground"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {t('settings.useDeviceLanguage')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
