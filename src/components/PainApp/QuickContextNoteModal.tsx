import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SaveButton } from '@/components/ui/save-button';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Utensils, Activity, Droplets, Calendar, Heart, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { saveVoiceNote, updateVoiceNote, ContextMetadata } from '@/lib/voice/saveNote';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { FivePointScale, ScaleOption } from './FivePointScale';
import { MultiSelectChips, ChipOption } from './MultiSelectChips';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useUserDefaults } from '@/features/settings/hooks/useUserSettings';

export interface EditingContextNote {
  id: string;
  text: string;
  context_type?: string;
  metadata?: ContextMetadata | null;
}

export interface QuickContextNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartVoice?: () => void;
  // Pre-filled data from voice input
  prefillData?: {
    mood?: number | null;
    stress?: number | null;
    sleep?: number | null;
    energy?: number | null;
    triggers?: string[];
    notes?: string;
  };
  // Edit mode
  editingNote?: EditingContextNote | null;
  onSaved?: () => void;
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

// Trigger-Kategorien (vereinfacht)
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

// Neue zusammengefasste Kategorie: Umgebung & Reize (ohne Wetter)
const ENVIRONMENT_TRIGGERS: ChipOption[] = [
  { id: 'much_screen', label: 'Viel Bildschirm' },
  { id: 'bright_light', label: 'Sehr helles Licht' },
  { id: 'noise', label: 'Viel Lärm' },
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

// Special chip for "nothing special"
const NOTHING_SPECIAL_ID = 'nothing_special';

export const QuickContextNoteModal: React.FC<QuickContextNoteModalProps> = ({
  isOpen,
  onClose,
  onStartVoice,
  prefillData,
  editingNote,
  onSaved,
}) => {
  const isMobile = useIsMobile();
  const { data: userDefaults } = useUserDefaults();
  const showCycleTracking = userDefaults?.track_cycle ?? false;
  const isEditMode = !!editingNote;
  
  // Block A: Tageszustand
  const [mood, setMood] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  
  // Block B: Trigger (vereinfacht)
  const [nutritionTriggers, setNutritionTriggers] = useState<string[]>([]);
  const [movementTriggers, setMovementTriggers] = useState<string[]>([]);
  const [fluidTriggers, setFluidTriggers] = useState<string[]>([]);
  const [environmentTriggers, setEnvironmentTriggers] = useState<string[]>([]);
  const [cycleTriggers, setCycleTriggers] = useState<string[]>([]);
  const [wellbeingTriggers, setWellbeingTriggers] = useState<string[]>([]);
  const [nothingSpecial, setNothingSpecial] = useState(false);
  
  // Block C: Freitext
  const [customText, setCustomText] = useState('');
  
  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showTriggers, setShowTriggers] = useState(false);

  // Load data when editing existing note
  useEffect(() => {
    if (editingNote && isOpen) {
      const meta = editingNote.metadata;
      if (meta) {
        setMood(meta.mood ?? null);
        setStress(meta.stress ?? null);
        setSleep(meta.sleep ?? null);
        setEnergy(meta.energy ?? null);
        setCustomText(meta.notes ?? '');
        
        // Map triggers to correct categories
        if (meta.triggers && meta.triggers.length > 0) {
          const nutrition: string[] = [];
          const movement: string[] = [];
          const fluid: string[] = [];
          const environment: string[] = [];
          const cycle: string[] = [];
          const wellbeing: string[] = [];
          
          meta.triggers.forEach(trigger => {
            if (NUTRITION_TRIGGERS.some(t => t.id === trigger)) nutrition.push(trigger);
            else if (MOVEMENT_TRIGGERS.some(t => t.id === trigger)) movement.push(trigger);
            else if (FLUID_TRIGGERS.some(t => t.id === trigger)) fluid.push(trigger);
            else if (ENVIRONMENT_TRIGGERS.some(t => t.id === trigger)) environment.push(trigger);
            else if (CYCLE_TRIGGERS.some(t => t.id === trigger)) cycle.push(trigger);
            else if (WELLBEING_TRIGGERS.some(t => t.id === trigger)) wellbeing.push(trigger);
          });
          
          setNutritionTriggers(nutrition);
          setMovementTriggers(movement);
          setFluidTriggers(fluid);
          setEnvironmentTriggers(environment);
          setCycleTriggers(cycle);
          setWellbeingTriggers(wellbeing);
          
          // Auto-expand triggers section if any were set
          if (nutrition.length || movement.length || fluid.length || environment.length || cycle.length || wellbeing.length) {
            setShowTriggers(true);
          }
        }
      }
    }
  }, [editingNote, isOpen]);

  // Apply prefill data when it changes
  useEffect(() => {
    if (prefillData && isOpen) {
      if (prefillData.mood !== undefined) setMood(prefillData.mood);
      if (prefillData.stress !== undefined) setStress(prefillData.stress);
      if (prefillData.sleep !== undefined) setSleep(prefillData.sleep);
      if (prefillData.energy !== undefined) setEnergy(prefillData.energy);
      if (prefillData.notes) setCustomText(prefillData.notes);
      
      // Map triggers to correct categories
      if (prefillData.triggers && prefillData.triggers.length > 0) {
        const nutrition: string[] = [];
        const movement: string[] = [];
        const fluid: string[] = [];
        const environment: string[] = [];
        const cycle: string[] = [];
        const wellbeing: string[] = [];
        
        prefillData.triggers.forEach(trigger => {
          if (NUTRITION_TRIGGERS.some(t => t.id === trigger)) nutrition.push(trigger);
          else if (MOVEMENT_TRIGGERS.some(t => t.id === trigger)) movement.push(trigger);
          else if (FLUID_TRIGGERS.some(t => t.id === trigger)) fluid.push(trigger);
          else if (ENVIRONMENT_TRIGGERS.some(t => t.id === trigger)) environment.push(trigger);
          else if (CYCLE_TRIGGERS.some(t => t.id === trigger)) cycle.push(trigger);
          else if (WELLBEING_TRIGGERS.some(t => t.id === trigger)) wellbeing.push(trigger);
        });
        
        if (nutrition.length) setNutritionTriggers(nutrition);
        if (movement.length) setMovementTriggers(movement);
        if (fluid.length) setFluidTriggers(fluid);
        if (environment.length) setEnvironmentTriggers(environment);
        if (cycle.length) setCycleTriggers(cycle);
        if (wellbeing.length) setWellbeingTriggers(wellbeing);
        
        // Auto-expand triggers section if any were set
        if (nutrition.length || movement.length || fluid.length || environment.length || cycle.length || wellbeing.length) {
          setShowTriggers(true);
        }
      }
    }
  }, [prefillData, isOpen]);

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
        setEnvironmentTriggers(values.environmentTriggers ?? values.weatherTriggers ?? values.screenTriggers ?? []);
        setCycleTriggers(values.cycleTriggers ?? []);
        setWellbeingTriggers(values.wellbeingTriggers ?? []);
        setNothingSpecial(false);
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

  // Handle "Heute nichts Besonderes" logic
  const handleNothingSpecialToggle = () => {
    if (!nothingSpecial) {
      // Selecting "nothing special" - clear all other triggers
      setNutritionTriggers([]);
      setMovementTriggers([]);
      setFluidTriggers([]);
      setEnvironmentTriggers([]);
      setCycleTriggers([]);
      setWellbeingTriggers([]);
      setNothingSpecial(true);
    } else {
      setNothingSpecial(false);
    }
  };

  // Wrapper to clear "nothing special" when any other trigger is selected
  const createTriggerHandler = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    return (values: string[]) => {
      if (values.length > 0) {
        setNothingSpecial(false);
      }
      setter(values);
    };
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
      ...environmentTriggers,
      ...cycleTriggers,
      ...wellbeingTriggers,
    ];
    
    if (nothingSpecial) {
      parts.push('Heute nichts Besonderes');
    } else if (allTriggers.length > 0) {
      // Map IDs to labels for readable output
      const triggerLabels = allTriggers.map(id => {
        const allOptions = [
          ...NUTRITION_TRIGGERS,
          ...MOVEMENT_TRIGGERS,
          ...FLUID_TRIGGERS,
          ...ENVIRONMENT_TRIGGERS,
          ...CYCLE_TRIGGERS,
          ...WELLBEING_TRIGGERS,
        ];
        return allOptions.find(o => o.id === id)?.label || id;
      });
      parts.push(`Trigger: ${triggerLabels.join(', ')}`);
    }
    
    if (customText.trim()) {
      parts.push(customText.trim());
    }
    
    const finalText = parts.join(' • ');
    
    // Strukturierte Metadaten für späteres Bearbeiten
    const metadata: ContextMetadata = {
      mood,
      stress,
      sleep,
      energy,
      triggers: allTriggers,
      notes: customText.trim() || undefined
    };

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
        environmentTriggers,
        cycleTriggers,
        wellbeingTriggers,
      }));

      // Only save to voice notes if there's actual data
      if (finalText.trim()) {
        if (isEditMode && editingNote) {
          // Update existing note
          await updateVoiceNote({
            id: editingNote.id,
            rawText: finalText,
            contextType: 'tageszustand',
            metadata
          });
          toast.success('Tageszustand aktualisiert');
          onSaved?.();
        } else {
          // Create new note
          await saveVoiceNote({
            rawText: finalText,
            sttConfidence: 1.0,
            source: 'manual',
            contextType: 'tageszustand',
            metadata
          });
          toast.success('Alltag & Auslöser gespeichert', {
            description: 'Wird in der nächsten Analyse berücksichtigt'
          });
        }
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
    setEnvironmentTriggers([]);
    setCycleTriggers([]);
    setWellbeingTriggers([]);
    setNothingSpecial(false);
    setCustomText('');
    setShowTriggers(false);
  };

  const hasAnyTriggers = nutritionTriggers.length > 0 || movementTriggers.length > 0 || 
    fluidTriggers.length > 0 || environmentTriggers.length > 0 || 
    cycleTriggers.length > 0 || wellbeingTriggers.length > 0 || nothingSpecial;

  const hasAnyData = mood !== null || stress !== null || sleep !== null || energy !== null ||
    hasAnyTriggers || customText.trim() !== '';

  const showLoadPrevious = hasPreviousValues() && !isEditMode;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn(
        "max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden modern-scrollbar",
        "bg-[#0B1220] border-[#1F2937]",
        isMobile && "max-w-[95vw]"
      )}>
        <DialogHeader>
          <DialogTitle className="text-xl text-[#E5E7EB]">
            {isEditMode ? 'Tageszustand bearbeiten' : 'Alltag & Auslöser eintragen'}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#9CA3AF]">
            Erfasse schnell deine wichtigsten Tagesfaktoren. Alle Angaben sind optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Formweite Spracheingabe - prominent oben */}
          <button
            onClick={handleVoiceClick}
            className="w-full flex items-center gap-4 p-4 rounded-lg bg-[#14B8A6]/10 border border-[#14B8A6]/30 hover:bg-[#14B8A6]/20 hover:border-[#14B8A6]/50 transition-all duration-150 group"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#14B8A6]/20 flex items-center justify-center group-hover:bg-[#14B8A6]/30 transition-colors">
              <Mic className="h-5 w-5 text-[#14B8A6]" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold text-[#14B8A6]">Spracheingabe</div>
              <div className="text-xs text-[#9CA3AF]">Einfach alles sagen.</div>
            </div>
          </button>

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

          {/* Block C: Freitext - ohne separaten Sprach-Button */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#E5E7EB]">
              Eigene Notiz (optional)
            </label>
            <Textarea
              placeholder="z.B. Reise, Streit, viel Arbeit, Kindergeburtstag …"
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
                {hasAnyTriggers && (
                  <span className="text-xs font-normal text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full">
                    {nothingSpecial ? '1' : (nutritionTriggers.length + movementTriggers.length + fluidTriggers.length + environmentTriggers.length + cycleTriggers.length + wellbeingTriggers.length)} ausgewählt
                  </span>
                )}
              </span>
              {showTriggers ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            
            {showTriggers && (
              <div className="space-y-5 pt-3">
                {/* "Heute nichts Besonderes" als normaler Chip */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleNothingSpecialToggle}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150",
                      nothingSpecial
                        ? "bg-[#22C55E]/15 border-[#22C55E]/50 text-[#22C55E]"
                        : "bg-[#0B1220] border-[#1F2937] text-[#9CA3AF] hover:border-[#4B5563] hover:text-[#E5E7EB]"
                    )}
                  >
                    Heute nichts Besonderes
                  </button>
                </div>

                <MultiSelectChips
                  title="Ernährung"
                  icon={Utensils}
                  options={NUTRITION_TRIGGERS}
                  selected={nutritionTriggers}
                  onChange={createTriggerHandler(setNutritionTriggers)}
                />
                
                <MultiSelectChips
                  title="Bewegung"
                  icon={Activity}
                  options={MOVEMENT_TRIGGERS}
                  selected={movementTriggers}
                  onChange={createTriggerHandler(setMovementTriggers)}
                />
                
                <MultiSelectChips
                  title="Flüssigkeit"
                  icon={Droplets}
                  options={FLUID_TRIGGERS}
                  selected={fluidTriggers}
                  onChange={createTriggerHandler(setFluidTriggers)}
                />
                
                <MultiSelectChips
                  title="Umgebung & Reize"
                  icon={Eye}
                  options={ENVIRONMENT_TRIGGERS}
                  selected={environmentTriggers}
                  onChange={createTriggerHandler(setEnvironmentTriggers)}
                />
                
                {showCycleTracking && (
                  <MultiSelectChips
                    title="Zyklus"
                    icon={Calendar}
                    options={CYCLE_TRIGGERS}
                    selected={cycleTriggers}
                    onChange={createTriggerHandler(setCycleTriggers)}
                  />
                )}
                
                <MultiSelectChips
                  title="Wohlbefinden"
                  icon={Heart}
                  options={WELLBEING_TRIGGERS}
                  selected={wellbeingTriggers}
                  onChange={createTriggerHandler(setWellbeingTriggers)}
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
            <SaveButton
              onClick={handleSave}
              loading={isSaving}
              className="min-w-[140px]"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
