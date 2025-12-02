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
import { Mic, Utensils, Activity, Droplets, CloudRain, Calendar, Heart, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { saveVoiceNote } from '@/lib/voice/saveNote';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { FivePointScale, ScaleOption } from './FivePointScale';
import { MultiSelectChips, ChipOption } from './MultiSelectChips';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface QuickContextNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartVoice?: () => void;
}

// 5-Punkt-Skalen Definitionen
const MOOD_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'Sehr schlecht', emoji: '😣', color: 'negative' },
  { value: 2, label: 'Eher schlecht', emoji: '🙁', color: 'warning' },
  { value: 3, label: 'Neutral', emoji: '😐', color: 'neutral' },
  { value: 4, label: 'Eher gut', emoji: '🙂', color: 'positive' },
  { value: 5, label: 'Sehr gut', emoji: '😄', color: 'excellent' },
];

const STRESS_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'Kein Stress', emoji: '😌', color: 'excellent' },
  { value: 2, label: 'Gering', emoji: '🙂', color: 'positive' },
  { value: 3, label: 'Mittel', emoji: '😐', color: 'neutral' },
  { value: 4, label: 'Hoch', emoji: '😰', color: 'warning' },
  { value: 5, label: 'Sehr hoch', emoji: '😫', color: 'negative' },
];

const SLEEP_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'Sehr schlecht', emoji: '😴', color: 'negative' },
  { value: 2, label: 'Eher schlecht', emoji: '😪', color: 'warning' },
  { value: 3, label: 'Okay', emoji: '😐', color: 'neutral' },
  { value: 4, label: 'Gut', emoji: '🙂', color: 'positive' },
  { value: 5, label: 'Sehr gut', emoji: '😊', color: 'excellent' },
];

const ENERGY_OPTIONS: ScaleOption[] = [
  { value: 1, label: 'Erschöpft', emoji: '🔋', color: 'negative' },
  { value: 2, label: 'Müde', emoji: '🔋', color: 'warning' },
  { value: 3, label: 'Mittel', emoji: '🔋', color: 'neutral' },
  { value: 4, label: 'Fit', emoji: '🔋', color: 'positive' },
  { value: 5, label: 'Energiegeladen', emoji: '⚡', color: 'excellent' },
];

// Trigger-Kategorien
const NUTRITION_TRIGGERS: ChipOption[] = [
  { id: 'meal_skipped', label: 'Mahlzeit ausgelassen' },
  { id: 'high_sugar', label: 'Viel Zucker' },
  { id: 'high_caffeine', label: 'Viel Koffein' },
  { id: 'alcohol', label: 'Alkohol' },
  { id: 'unusual_food', label: 'Ungewohntes Essen' },
];

const MOVEMENT_TRIGGERS: ChipOption[] = [
  { id: 'no_movement', label: 'Fast keine Bewegung' },
  { id: 'walk', label: 'Spaziergang' },
  { id: 'intense_sport', label: 'Intensiver Sport' },
];

const FLUID_TRIGGERS: ChipOption[] = [
  { id: 'too_little', label: 'Zu wenig getrunken' },
  { id: 'too_much', label: 'Sehr viel getrunken' },
];

const WEATHER_TRIGGERS: ChipOption[] = [
  { id: 'weather_change', label: 'Starker Wetterwechsel' },
  { id: 'bright_light', label: 'Sehr helles Licht' },
  { id: 'noise', label: 'Viel Lärm' },
];

const SCREEN_TRIGGERS: ChipOption[] = [
  { id: 'much_screen', label: 'Viel Bildschirm' },
  { id: 'late_screen', label: 'Späte Bildschirmzeit' },
];

const CYCLE_TRIGGERS: ChipOption[] = [
  { id: 'period', label: 'Periode' },
  { id: 'pms', label: 'PMS' },
  { id: 'ovulation', label: 'Eisprung' },
];

const WELLBEING_TRIGGERS: ChipOption[] = [
  { id: 'nausea', label: 'Übelkeit' },
  { id: 'dizzy', label: 'Schwindel' },
  { id: 'tense', label: 'Verspannt' },
];

export const QuickContextNoteModal: React.FC<QuickContextNoteModalProps> = ({
  isOpen,
  onClose,
  onStartVoice,
}) => {
  const isMobile = useIsMobile();
  
  // Block A: Tageszustand
  const [mood, setMood] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  
  // Block B: Trigger
  const [nutritionTriggers, setNutritionTriggers] = useState<string[]>([]);
  const [movementTriggers, setMovementTriggers] = useState<string[]>([]);
  const [fluidTriggers, setFluidTriggers] = useState<string[]>([]);
  const [weatherTriggers, setWeatherTriggers] = useState<string[]>([]);
  const [screenTriggers, setScreenTriggers] = useState<string[]>([]);
  const [cycleTriggers, setCycleTriggers] = useState<string[]>([]);
  const [wellbeingTriggers, setWellbeingTriggers] = useState<string[]>([]);
  
  // Block C: Freitext
  const [customText, setCustomText] = useState('');
  
  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showTriggers, setShowTriggers] = useState(false);

  // Load previous values from localStorage
  const loadPreviousValues = () => {
    try {
      const saved = localStorage.getItem('lastContextNoteValues');
      if (saved) {
        const values = JSON.parse(saved);
        setMood(values.mood ?? null);
        setStress(values.stress ?? null);
        setSleep(values.sleep ?? null);
        setEnergy(values.energy ?? null);
        setNutritionTriggers(values.nutritionTriggers ?? []);
        setMovementTriggers(values.movementTriggers ?? []);
        setFluidTriggers(values.fluidTriggers ?? []);
        setWeatherTriggers(values.weatherTriggers ?? []);
        setScreenTriggers(values.screenTriggers ?? []);
        setCycleTriggers(values.cycleTriggers ?? []);
        setWellbeingTriggers(values.wellbeingTriggers ?? []);
        toast.success('Werte vom letzten Eintrag übernommen');
      }
    } catch (error) {
      console.error('Error loading previous values:', error);
    }
  };

  const hasPreviousValues = () => {
    try {
      const saved = localStorage.getItem('lastContextNoteValues');
      return !!saved;
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    // Zusammenstellen der Daten
    const parts: string[] = [];
    
    if (mood !== null) parts.push(`Stimmung: ${MOOD_OPTIONS[mood - 1].label}`);
    if (stress !== null) parts.push(`Stress: ${STRESS_OPTIONS[stress - 1].label}`);
    if (sleep !== null) parts.push(`Schlaf: ${SLEEP_OPTIONS[sleep - 1].label}`);
    if (energy !== null) parts.push(`Energie: ${ENERGY_OPTIONS[energy - 1].label}`);
    
    const allTriggers = [
      ...nutritionTriggers,
      ...movementTriggers,
      ...fluidTriggers,
      ...weatherTriggers,
      ...screenTriggers,
      ...cycleTriggers,
      ...wellbeingTriggers,
    ];
    
    if (allTriggers.length > 0) {
      parts.push(`Trigger: ${allTriggers.join(', ')}`);
    }
    
    if (customText.trim()) {
      parts.push(customText.trim());
    }
    
    const finalText = parts.join(' • ');

    setIsSaving(true);
    try {
      // Save current values to localStorage for "load previous" feature
      localStorage.setItem('lastContextNoteValues', JSON.stringify({
        mood,
        stress,
        sleep,
        energy,
        nutritionTriggers,
        movementTriggers,
        fluidTriggers,
        weatherTriggers,
        screenTriggers,
        cycleTriggers,
        wellbeingTriggers,
      }));

      // Only save to voice notes if there's actual data
      if (finalText.trim()) {
        await saveVoiceNote({
          rawText: finalText,
          sttConfidence: 1.0,
          source: 'manual'
        });

        toast.success('Alltag & Auslöser gespeichert', {
          description: 'Wird in der nächsten Analyse berücksichtigt'
        });
      } else {
        toast.success('Eintrag gespeichert');
      }

      handleReset();
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
    setMood(null);
    setStress(null);
    setSleep(null);
    setEnergy(null);
    setNutritionTriggers([]);
    setMovementTriggers([]);
    setFluidTriggers([]);
    setWeatherTriggers([]);
    setScreenTriggers([]);
    setCycleTriggers([]);
    setWellbeingTriggers([]);
    setCustomText('');
  };

  const hasAnyData = mood !== null || stress !== null || sleep !== null || energy !== null ||
    nutritionTriggers.length > 0 || movementTriggers.length > 0 || fluidTriggers.length > 0 ||
    weatherTriggers.length > 0 || screenTriggers.length > 0 || cycleTriggers.length > 0 ||
    wellbeingTriggers.length > 0 || customText.trim() !== '';

  const showLoadPrevious = hasPreviousValues();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn(
        "max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden modern-scrollbar",
        "bg-[#0B1220] border-[#1F2937]",
        isMobile && "max-w-[95vw]"
      )}>
        <DialogHeader>
          <DialogTitle className="text-xl text-[#E5E7EB]">
            Alltag & Auslöser eintragen
          </DialogTitle>
          <DialogDescription className="text-sm text-[#9CA3AF]">
            Erfasse schnell deine wichtigsten Tagesfaktoren. Alle Angaben sind optional.
          </DialogDescription>
        </DialogHeader>

        {showLoadPrevious && (
          <Button
            variant="outline"
            size="sm"
            onClick={loadPreviousValues}
            className="w-full bg-[#0B1220] border-[#1F2937] text-[#9CA3AF] hover:bg-[#111827] hover:border-[#4B5563] hover:text-[#E5E7EB]"
          >
            Werte vom letzten Eintrag übernehmen
          </Button>
        )}

        <div className="space-y-4 py-2">
          {/* Block A: Tageszustand - Immer sichtbar */}
          <div className="space-y-3 p-4 bg-[#111827]/50 rounded-lg border border-[#1F2937]/50">
            <h2 className="text-base font-semibold text-[#E5E7EB] flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Tageszustand
            </h2>
            
            <FivePointScale
              title="Stimmung heute"
              subtitle="Wie hast du dich über den Tag gefühlt?"
              options={MOOD_OPTIONS}
              value={mood}
              onChange={setMood}
            />
            
            <FivePointScale
              title="Stress"
              subtitle="Wie gestresst warst du heute?"
              options={STRESS_OPTIONS}
              value={stress}
              onChange={setStress}
            />
            
            <FivePointScale
              title="Schlaf letzte Nacht"
              subtitle="Wie gut hast du geschlafen?"
              options={SLEEP_OPTIONS}
              value={sleep}
              onChange={setSleep}
            />
            
            <FivePointScale
              title="Energie"
              subtitle="Wie energiegeladen fühlst du dich?"
              options={ENERGY_OPTIONS}
              value={energy}
              onChange={setEnergy}
            />
          </div>

          {/* Block C: Freitext + Sprache - Direkt nach Tageszustand */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-[#E5E7EB]">
                Eigene Notiz (optional)
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleVoiceClick}
                className="h-10 px-4 gap-2.5 bg-[#14B8A6]/15 border border-[#14B8A6]/50 text-[#14B8A6] hover:bg-[#14B8A6]/25 hover:border-[#14B8A6]/70 hover:text-[#0D9488] transition-all duration-150 shadow-sm hover:shadow-[0_0_12px_rgba(20,184,166,0.25)]"
              >
                <Mic className="h-5 w-5" />
                <span className="text-sm font-semibold">Einsprechen</span>
              </Button>
            </div>
            <Textarea
              placeholder="Z.B. viel Bildschirmarbeit oder Streit im Job..."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="min-h-[80px] bg-[#0B1220] border-[#1F2937] text-[#E5E7EB] placeholder:text-[#4B5563] focus:border-[#22C55E]/50 focus:ring-[#22C55E]/20"
              rows={3}
            />
          </div>

          {/* Block B: Trigger - Einklappbar, standardmäßig geschlossen */}
          <div className="space-y-3 p-4 bg-[#111827]/50 rounded-lg border border-[#1F2937]/50">
            <button
              onClick={() => setShowTriggers(!showTriggers)}
              className="w-full flex items-center justify-between text-base font-semibold text-[#E5E7EB] hover:text-[#22C55E] transition-colors"
            >
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Was war heute besonders? (optional)
              </span>
              {showTriggers ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            
            {showTriggers && (
              <div className="space-y-4 pt-2">
                <p className="text-xs text-[#9CA3AF] leading-tight">
                  Wähle alles aus, was heute besonders war (mehrere möglich). Wenn nichts passt, lass diesen Bereich einfach zu.
                </p>
                <MultiSelectChips
                  title="Ernährung"
                  icon={Utensils}
                  options={NUTRITION_TRIGGERS}
                  selected={nutritionTriggers}
                  onChange={setNutritionTriggers}
                />
                
                <MultiSelectChips
                  title="Bewegung"
                  icon={Activity}
                  options={MOVEMENT_TRIGGERS}
                  selected={movementTriggers}
                  onChange={setMovementTriggers}
                />
                
                <MultiSelectChips
                  title="Flüssigkeit"
                  icon={Droplets}
                  options={FLUID_TRIGGERS}
                  selected={fluidTriggers}
                  onChange={setFluidTriggers}
                />
                
                <MultiSelectChips
                  title="Wetter & Umfeld"
                  icon={CloudRain}
                  options={WEATHER_TRIGGERS}
                  selected={weatherTriggers}
                  onChange={setWeatherTriggers}
                />
                
                <MultiSelectChips
                  title="Bildschirm & Reize"
                  icon={Monitor}
                  options={SCREEN_TRIGGERS}
                  selected={screenTriggers}
                  onChange={setScreenTriggers}
                />
                
                <MultiSelectChips
                  title="Zyklus"
                  icon={Calendar}
                  options={CYCLE_TRIGGERS}
                  selected={cycleTriggers}
                  onChange={setCycleTriggers}
                />
                
                <MultiSelectChips
                  title="Wohlbefinden"
                  icon={Heart}
                  options={WELLBEING_TRIGGERS}
                  selected={wellbeingTriggers}
                  onChange={setWellbeingTriggers}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-[#1F2937]">
            <Button
              variant="ghost"
              onClick={handleReset}
              disabled={!hasAnyData}
              className="text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#111827]"
            >
              Zurücksetzen
            </Button>
            <div className="flex-1" />
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="min-w-[140px] bg-[#22C55E] hover:bg-[#16A34A] text-[#020617] font-semibold shadow-sm disabled:bg-[#4B5563] disabled:text-[#9CA3AF]"
            >
              {isSaving ? 'Speichert...' : 'Speichern'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
