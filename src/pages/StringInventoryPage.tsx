/**
 * String Inventory Page (DEV ONLY)
 * 
 * Shows all translation keys with their values.
 * Helps identify missing translations.
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Search, ArrowLeft, Languages, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showSuccessToast } from '@/lib/toastHelpers';

import de from '@/locales/de.json';
import en from '@/locales/en.json';

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

interface StringEntry {
  key: string;
  de: string;
  en: string;
  category: string;
}

// Flatten nested translation object into dot-notation keys
function flattenTranslations(obj: TranslationObject, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenTranslations(value as TranslationObject, fullKey));
    }
  }
  
  return result;
}

export default function StringInventoryPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Flatten both translation files
  const flatDe = useMemo(() => flattenTranslations(de as TranslationObject), []);
  const flatEn = useMemo(() => flattenTranslations(en as TranslationObject), []);

  // Combine into string entries
  const allStrings = useMemo<StringEntry[]>(() => {
    const allKeys = new Set([...Object.keys(flatDe), ...Object.keys(flatEn)]);
    
    return Array.from(allKeys).map(key => {
      const category = key.split('.')[0];
      return {
        key,
        de: flatDe[key] || '',
        en: flatEn[key] || '',
        category,
      };
    }).sort((a, b) => a.key.localeCompare(b.key));
  }, [flatDe, flatEn]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(allStrings.map(s => s.category));
    return Array.from(cats).sort();
  }, [allStrings]);

  // Filter strings
  const filteredStrings = useMemo(() => {
    return allStrings.filter(entry => {
      const matchesSearch = !search || 
        entry.key.toLowerCase().includes(search.toLowerCase()) ||
        entry.de.toLowerCase().includes(search.toLowerCase()) ||
        entry.en.toLowerCase().includes(search.toLowerCase());
      
      const matchesCategory = !selectedCategory || entry.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [allStrings, search, selectedCategory]);

  // Stats
  const stats = useMemo(() => {
    const total = allStrings.length;
    const missingEn = allStrings.filter(s => !s.en).length;
    const missingDe = allStrings.filter(s => !s.de).length;
    
    return { total, missingEn, missingDe };
  }, [allStrings]);

  // Copy as JSON
  const handleCopyJson = async () => {
    const json: Record<string, { de: string; en: string }> = {};
    
    allStrings.forEach(entry => {
      json[entry.key] = {
        de: entry.de,
        en: entry.en,
      };
    });
    
    try {
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      setCopied(true);
      showSuccessToast('JSON kopiert');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Don't render in production
  if (!import.meta.env.DEV) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Only available in development mode</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Languages className="w-5 h-5 text-primary" />
            String Inventory
          </h1>
          <p className="text-sm text-muted-foreground">
            All translation keys
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card className={stats.missingEn > 0 ? 'border-warning/50' : ''}>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${stats.missingEn > 0 ? 'text-warning' : 'text-green-500'}`}>
              {stats.missingEn}
            </div>
            <div className="text-xs text-muted-foreground">Missing EN</div>
          </CardContent>
        </Card>
        <Card className={stats.missingDe > 0 ? 'border-destructive/50' : ''}>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${stats.missingDe > 0 ? 'text-destructive' : 'text-green-500'}`}>
              {stats.missingDe}
            </div>
            <div className="text-xs text-muted-foreground">Missing DE</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-4">
        <Button 
          onClick={handleCopyJson} 
          variant="outline" 
          className="flex-1"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copy as JSON
            </>
          )}
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search keys or text..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Badge
          variant={selectedCategory === null ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => setSelectedCategory(null)}
        >
          All ({allStrings.length})
        </Badge>
        {categories.map(cat => {
          const count = allStrings.filter(s => s.category === cat).length;
          return (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat} ({count})
            </Badge>
          );
        })}
      </div>

      {/* String list */}
      <div className="space-y-3">
        {filteredStrings.map(entry => (
          <Card key={entry.key} className="overflow-hidden">
            <CardHeader className="p-3 pb-2 bg-muted/30">
              <CardTitle className="text-xs font-mono text-primary flex items-center gap-2">
                {entry.key}
                {entry.en && entry.de ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-warning" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-2 space-y-2">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 text-[10px]">DE</Badge>
                <span className="text-sm text-foreground">
                  {entry.de || <span className="text-muted-foreground italic">missing</span>}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 text-[10px]">EN</Badge>
                <span className="text-sm text-foreground">
                  {entry.en || <span className="text-muted-foreground italic">missing</span>}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredStrings.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No strings found
        </div>
      )}

      {/* Count indicator */}
      <div className="text-center text-sm text-muted-foreground mt-6">
        Showing {filteredStrings.length} of {allStrings.length} strings
      </div>
    </div>
  );
}
