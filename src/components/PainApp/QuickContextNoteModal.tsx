import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Smile, Moon, Utensils, Activity, Coffee, Heart, Plus, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { saveVoiceNote } from '@/lib/voice/saveNote';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface QuickContextNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartVoice?: () => void;
}

const CONTEXT_CATEGORIES = [
  { icon: Smile, label: 'Stimmung', examples: ['Gut gelaunt', 'Gestresst', 'Müde', 'Energiegeladen'] },
  { icon: Moon, label: 'Schlaf', examples: ['Gut geschlafen', 'Schlecht geschlafen', 'Unruhig', 'Ausgeruht'] },
  { icon: Activity, label: 'Stress', examples: ['Viel Stress', 'Entspannt', 'Hektisch', 'Ruhig'] },
  { icon: Utensils, label: 'Ernährung', examples: ['Viel getrunken', 'Wenig gegessen', 'Gesund gegessen', 'Fastfood'] },
  { icon: Coffee, label: 'Aktivität', examples: ['Sport gemacht', 'Viel gelaufen', 'Sitzend', 'Aktiv'] },
  { icon: Heart, label: 'Wohlbefinden', examples: ['Fühle mich gut', 'Unwohl', 'Ausgeglichen', 'Angespannt'] },
];

export const QuickContextNoteModal: React.FC<QuickContextNoteModalProps> = ({
  isOpen,
  onClose,
  onStartVoice,
}) => {
  const isMobile = useIsMobile();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [customText, setCustomText] = useState('');
  const [selectedExamples, setSelectedExamples] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleCategorySelect = (index: number) => {
    if (selectedCategory === index) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(index);
      setSelectedExamples([]);
    }
  };

  const handleExampleToggle = (example: string) => {
    if (selectedExamples.includes(example)) {
      setSelectedExamples(selectedExamples.filter(e => e !== example));
    } else {
      setSelectedExamples([...selectedExamples, example]);
    }
  };

  const handleSave = async () => {
    const category = selectedCategory !== null ? CONTEXT_CATEGORIES[selectedCategory].label : '';
    const examples = selectedExamples.join(', ');
    const finalText = [category, examples, customText].filter(Boolean).join(' • ');

    if (!finalText.trim()) {
      toast.error('Bitte fügen Sie eine Notiz hinzu');
      return;
    }

    setIsSaving(true);
    try {
      await saveVoiceNote({
        rawText: finalText,
        sttConfidence: 1.0,
        source: 'manual'
      });

      toast.success('Kontext-Notiz gespeichert', {
        description: 'Wird in der nächsten Analyse berücksichtigt'
      });

      // Reset und schließen
      setSelectedCategory(null);
      setCustomText('');
      setSelectedExamples([]);
      onClose();
    } catch (error) {
      console.error('Error saving context note:', error);
      toast.error('Fehler beim Speichern', {
        description: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoiceClick = () => {
    onClose();
    onStartVoice?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn("max-w-2xl max-h-[90vh] overflow-y-auto", isMobile && "max-w-[95vw]")}>
        <DialogHeader>
          <DialogTitle>Kontext-Notiz hinzufügen</DialogTitle>
          <DialogDescription>
            Erfassen Sie schnell zusätzliche Informationen wie Stimmung, Schlafqualität oder Aktivitäten
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Kategorien */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Kategorie wählen</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CONTEXT_CATEGORIES.map((category, idx) => (
                <Button
                  key={idx}
                  variant={selectedCategory === idx ? 'default' : 'outline'}
                  className="justify-start h-auto py-3"
                  onClick={() => handleCategorySelect(idx)}
                >
                  <category.icon className="h-4 w-4 mr-2" />
                  {category.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Schnell-Auswahl für gewählte Kategorie */}
          {selectedCategory !== null && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <h3 className="text-sm font-medium">
                {CONTEXT_CATEGORIES[selectedCategory].label}
              </h3>
              <div className="flex flex-wrap gap-2">
                {CONTEXT_CATEGORIES[selectedCategory].examples.map((example, idx) => (
                  <Badge
                    key={idx}
                    variant={selectedExamples.includes(example) ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/80"
                    onClick={() => handleExampleToggle(example)}
                  >
                    {selectedExamples.includes(example) && '✓ '}
                    {example}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Freitext */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Eigene Notiz (optional)</h3>
            <Textarea
              placeholder="z.B. Heute besonders viel Bildschirmarbeit, Nacken verspannt..."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Vorschau */}
          {(selectedCategory !== null || selectedExamples.length > 0 || customText.trim()) && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <p className="text-xs font-medium text-muted-foreground">Vorschau</p>
              <p className="text-sm">
                {[
                  selectedCategory !== null ? CONTEXT_CATEGORIES[selectedCategory].label : '',
                  selectedExamples.join(', '),
                  customText
                ].filter(Boolean).join(' • ')}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleVoiceClick}
              className="flex-1"
            >
              <Mic className="h-4 w-4 mr-2" />
              Per Sprache
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || (!selectedExamples.length && !customText.trim())}
              className="flex-1"
            >
              {isSaving ? 'Speichere...' : 'Speichern'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};