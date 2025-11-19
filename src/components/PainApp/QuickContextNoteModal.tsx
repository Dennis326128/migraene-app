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
import { Smile, Moon, Utensils, Activity, Coffee, Heart, Plus, Mic, Droplets, Sun, Calendar } from 'lucide-react';
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
  { icon: Coffee, label: 'Sport & Bewegung', examples: ['Joggen', 'Yoga', 'Spaziergang', 'Workout', 'Keine Bewegung'] },
  { icon: Droplets, label: 'Flüssigkeit', examples: ['2L Wasser', 'Viel getrunken', 'Wenig getrunken', '1L Wasser'] },
  { icon: Sun, label: 'Wetter', examples: ['Sonnig', 'Bewölkt', 'Regen', 'Gewitter', 'Wetterwechsel'] },
  { icon: Calendar, label: 'Zyklus', examples: ['Periode', 'PMS', 'Ovulation', 'Zyklusmitte'] },
  { icon: Heart, label: 'Wohlbefinden', examples: ['Fühle mich gut', 'Unwohl', 'Ausgeglichen', 'Angespannt'] },
];

export const QuickContextNoteModal: React.FC<QuickContextNoteModalProps> = ({
  isOpen,
  onClose,
  onStartVoice,
}) => {
  const isMobile = useIsMobile();
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [customText, setCustomText] = useState('');
  const [selectedExamples, setSelectedExamples] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleCategoryToggle = (index: number) => {
    if (selectedCategories.includes(index)) {
      // Deselect category and remove its examples
      setSelectedCategories(selectedCategories.filter(i => i !== index));
      const categoryExamples = CONTEXT_CATEGORIES[index].examples;
      setSelectedExamples(selectedExamples.filter(e => !categoryExamples.includes(e)));
    } else {
      // Add category
      setSelectedCategories([...selectedCategories, index]);
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
    const categoryLabels = selectedCategories.map(i => CONTEXT_CATEGORIES[i].label).join(', ');
    const examples = selectedExamples.join(', ');
    const finalText = [categoryLabels, examples, customText].filter(Boolean).join(' • ');

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
      setSelectedCategories([]);
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

  const handleReset = () => {
    setSelectedCategories([]);
    setCustomText('');
    setSelectedExamples([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn("max-w-3xl max-h-[90vh] overflow-y-auto", isMobile && "max-w-[95vw]")}>
        <DialogHeader>
          <DialogTitle>Alltag & Auslöser eintragen</DialogTitle>
          <DialogDescription>
            Wählen Sie Kategorien und Details aus oder geben Sie eigene Informationen ein
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Categories Grid */}
          <div>
            <label className="text-sm font-medium mb-3 block">Kategorien auswählen (mehrere möglich)</label>
            <div className="grid grid-cols-3 gap-2">
              {CONTEXT_CATEGORIES.map((category, index) => {
                const Icon = category.icon;
                const isSelected = selectedCategories.includes(index);
                return (
                  <Button
                    key={index}
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "h-auto py-3 flex flex-col items-center gap-2",
                      isSelected && "ring-2 ring-primary"
                    )}
                    onClick={() => handleCategoryToggle(index)}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{category.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Examples for Selected Categories */}
          {selectedCategories.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-3 block">Details auswählen</label>
              <div className="space-y-3">
                {selectedCategories.map(categoryIndex => (
                  <div key={categoryIndex} className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      {React.createElement(CONTEXT_CATEGORIES[categoryIndex].icon, { className: "h-4 w-4" })}
                      {CONTEXT_CATEGORIES[categoryIndex].label}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {CONTEXT_CATEGORIES[categoryIndex].examples.map(example => (
                        <Badge
                          key={example}
                          variant={selectedExamples.includes(example) ? "default" : "outline"}
                          className="cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => handleExampleToggle(example)}
                        >
                          {example}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Text */}
          <div>
            <label className="text-sm font-medium mb-2 block">Eigene Notizen (optional)</label>
            <Textarea
              placeholder="Z.B. 'Viel Bildschirmarbeit heute' oder 'Starker Wind draußen'"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {/* Preview */}
          {(selectedExamples.length > 0 || customText.trim()) && (
            <div className="p-3 bg-muted rounded-lg">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Vorschau:</label>
              <p className="text-sm">
                {[
                  ...selectedExamples,
                  customText.trim()
                ].filter(Boolean).join(' • ')}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleVoiceClick}
            >
              <Mic className="h-4 w-4 mr-2" />
              Per Sprache eingeben
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={selectedCategories.length === 0 && !customText.trim() && selectedExamples.length === 0}
            >
              Zurücksetzen
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || (selectedExamples.length === 0 && !customText.trim())}
              className="flex-1"
            >
              {isSaving ? 'Speichert...' : 'Speichern'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};