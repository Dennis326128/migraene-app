/**
 * DraftComposerPage
 * Main page for draft review and editing
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PainSlider } from '@/components/ui/pain-slider';
import { useToast } from '@/hooks/use-toast';
import { useMeds } from '@/features/meds/hooks/useMeds';
import { useCreateEntry } from '@/features/entries/hooks/useEntryMutations';
import { 
  ArrowLeft, 
  Plus, 
  Save,
  Zap,
  Pill,
  Activity,
  Brain,
  FileText,
  Clock,
  Calendar,
  X,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DraftInput } from './DraftInput';
import { DraftSection, UncertainField } from './DraftSection';
import { useDraftComposer } from '../hooks/useDraftComposer';
import type { DraftSectionType, MedicationIntake } from '../types/draft.types';

const SECTION_CONFIG: Record<DraftSectionType, { title: string; icon: React.ReactNode }> = {
  attack: { title: 'Kopfschmerz / Attacke', icon: <Zap className="h-4 w-4 text-red-500" /> },
  medication: { title: 'Medikation', icon: <Pill className="h-4 w-4 text-blue-500" /> },
  effect: { title: 'Wirkung', icon: <Activity className="h-4 w-4 text-green-500" /> },
  symptoms: { title: 'Symptome', icon: <Brain className="h-4 w-4 text-purple-500" /> },
  triggers: { title: 'Trigger', icon: <Zap className="h-4 w-4 text-orange-500" /> },
  notes: { title: 'Notizen', icon: <FileText className="h-4 w-4 text-slate-500" /> },
  other: { title: 'Sonstiges', icon: <FileText className="h-4 w-4 text-gray-500" /> },
};

const PAIN_LOCATIONS = [
  { value: 'einseitig_links', label: 'Einseitig links' },
  { value: 'einseitig_rechts', label: 'Einseitig rechts' },
  { value: 'beidseitig', label: 'Beidseitig' },
  { value: 'stirn', label: 'Stirnbereich' },
  { value: 'nacken', label: 'Nackenbereich' },
  { value: 'schlaefe', label: 'Schläfenbereich' },
];

const EFFECT_OPTIONS = [
  { value: 'none', label: 'Keine Wirkung', color: 'bg-red-100 text-red-800' },
  { value: 'low', label: 'Geringe Wirkung', color: 'bg-orange-100 text-orange-800' },
  { value: 'medium', label: 'Mittlere Wirkung', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'good', label: 'Gute Wirkung', color: 'bg-green-100 text-green-800' },
  { value: 'excellent', label: 'Sehr gute Wirkung', color: 'bg-emerald-100 text-emerald-800' },
];

export function DraftComposerPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: userMeds = [] } = useMeds();
  const createEntry = useCreateEntry();
  
  const {
    draft,
    isProcessing,
    inputText,
    setInputText,
    processDraft,
    clearDraft,
    activeSections,
    addSection,
    removeSection,
    availableSections,
    updateAttack,
    updateMedication,
    removeMedication,
    updateSymptoms,
    updateTriggers,
    updateNotes,
    isValid,
    validationErrors,
    hasUncertainFields,
  } = useDraftComposer();
  
  const [openSections, setOpenSections] = useState<Set<DraftSectionType>>(new Set(['attack', 'medication']));
  const [isSaving, setIsSaving] = useState(false);
  
  // Auto-open sections with data or uncertainties
  useEffect(() => {
    if (draft) {
      const sectionsToOpen = new Set<DraftSectionType>(activeSections);
      if (draft.hasUncertainFields) {
        // Open all sections with uncertain fields
        activeSections.forEach(s => sectionsToOpen.add(s));
      }
      setOpenSections(sectionsToOpen);
    }
  }, [draft, activeSections]);
  
  const toggleSection = (section: DraftSectionType) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };
  
  const handleSave = async () => {
    if (!draft || !isValid) {
      toast({
        title: 'Fehler',
        description: validationErrors[0] || 'Bitte alle Pflichtfelder ausfüllen',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Build payload from draft
      const payload = {
        selected_date: draft.attack?.date.value || new Date().toISOString().slice(0, 10),
        selected_time: draft.attack?.time.value || new Date().toTimeString().slice(0, 5),
        pain_level: draft.attack?.painLevel.value || 5,
        pain_location: draft.attack?.painLocation?.value as any || null,
        medications: draft.medications.map(m => m.medicationName.value).filter(Boolean) as string[],
        notes: draft.notes.value || null,
        aura_type: 'keine' as const,
      };
      
      await createEntry.mutateAsync(payload as any);
      
      toast({
        title: 'Gespeichert',
        description: 'Dein Eintrag wurde erfolgreich gespeichert.',
      });
      
      navigate('/');
    } catch (error) {
      console.error('Failed to save entry:', error);
      toast({
        title: 'Fehler beim Speichern',
        description: 'Bitte versuche es erneut.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Before draft is created - show input
  if (!draft) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader 
          title="Spracheingabe"
          onBack={() => navigate('/')}
        />
        
        <div className="container max-w-2xl mx-auto p-4 space-y-6">
          <DraftInput
            value={inputText}
            onChange={setInputText}
            onSubmit={processDraft}
            isProcessing={isProcessing}
          />
          
          {/* Example texts */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Beispiele:</p>
            <div className="flex flex-wrap gap-2">
              {[
                'Gestern den ganzen Tag Migräne, um 19 Uhr Sumatriptan, hat gut geholfen',
                'Heute früh Kopfschmerzen, kein Medikament',
                'Schwindel und Übelkeit, Trigger war Stress',
              ].map((example, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted transition-colors text-xs"
                  onClick={() => setInputText(example)}
                >
                  {example.slice(0, 30)}...
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Draft review screen
  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader 
        title="Entwurf prüfen"
        onBack={clearDraft}
      />
      
      <div className="container max-w-2xl mx-auto p-4 space-y-4">
        {/* Validation errors banner */}
        {validationErrors.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm font-medium text-destructive">
              Fehlende Pflichtfelder:
            </p>
            <ul className="text-sm text-destructive/80 mt-1 list-disc list-inside">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Active sections */}
        <div className="space-y-3">
          {/* Attack Section */}
          {activeSections.includes('attack') && (
            <DraftSection
              type="attack"
              title={SECTION_CONFIG.attack.title}
              icon={SECTION_CONFIG.attack.icon}
              isOpen={openSections.has('attack')}
              onToggle={() => toggleSection('attack')}
              isRequired
              hasUncertainty={
                draft.attack?.date.confidence === 'low' ||
                draft.attack?.time.confidence === 'low' ||
                draft.attack?.painLevel.confidence === 'low'
              }
              uncertaintyHint="Einige Werte wurden aus dem Text geschätzt"
            >
              <div className="space-y-4">
                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Datum
                    </Label>
                    {draft.attack?.date.confidence === 'low' ? (
                      <UncertainField hint="Aus Text geschätzt">
                        <Input
                          type="date"
                          value={draft.attack?.date.value || ''}
                          onChange={(e) => updateAttack({
                            date: { value: e.target.value, confidence: 'high', source: 'user' }
                          })}
                        />
                      </UncertainField>
                    ) : (
                      <Input
                        type="date"
                        value={draft.attack?.date.value || ''}
                        onChange={(e) => updateAttack({
                          date: { value: e.target.value, confidence: 'high', source: 'user' }
                        })}
                      />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Uhrzeit
                    </Label>
                    {draft.attack?.time.confidence === 'low' || !draft.attack?.time.value ? (
                      <UncertainField hint={draft.attack?.time.originalText || 'Zeit fehlt'}>
                        <Input
                          type="time"
                          value={draft.attack?.time.value || ''}
                          onChange={(e) => updateAttack({
                            time: { value: e.target.value, confidence: 'high', source: 'user' }
                          })}
                        />
                      </UncertainField>
                    ) : (
                      <Input
                        type="time"
                        value={draft.attack?.time.value || ''}
                        onChange={(e) => updateAttack({
                          time: { value: e.target.value, confidence: 'high', source: 'user' }
                        })}
                      />
                    )}
                  </div>
                </div>
                
                {/* Pain Level */}
                <div className="space-y-2">
                  <Label>Schmerzstärke</Label>
                  {draft.attack?.painLevel.confidence === 'low' ? (
                    <UncertainField hint="Bitte Stärke auswählen">
                      <PainSlider
                        value={draft.attack?.painLevel.value || 5}
                        onValueChange={(v) => updateAttack({
                          painLevel: { value: v, confidence: 'high', source: 'user' }
                        })}
                      />
                    </UncertainField>
                  ) : (
                    <PainSlider
                      value={draft.attack?.painLevel.value || 5}
                      onValueChange={(v) => updateAttack({
                        painLevel: { value: v, confidence: 'high', source: 'user' }
                      })}
                    />
                  )}
                </div>
                
                {/* Pain Location */}
                <div className="space-y-2">
                  <Label>Lokalisation (optional)</Label>
                  <Select
                    value={draft.attack?.painLocation?.value || ''}
                    onValueChange={(v) => updateAttack({
                      painLocation: { value: v, confidence: 'high', source: 'user' }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Wo tut es weh?" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAIN_LOCATIONS.map(loc => (
                        <SelectItem key={loc.value} value={loc.value}>
                          {loc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DraftSection>
          )}
          
          {/* Medication Section */}
          {activeSections.includes('medication') && (
            <DraftSection
              type="medication"
              title={SECTION_CONFIG.medication.title}
              icon={SECTION_CONFIG.medication.icon}
              isOpen={openSections.has('medication')}
              onToggle={() => toggleSection('medication')}
              onRemove={() => removeSection('medication')}
              isEmpty={draft.medications.length === 0}
              hasUncertainty={draft.medications.some(m => 
                m.time.confidence === 'low' || m.medicationName.confidence === 'low'
              )}
            >
              <div className="space-y-4">
                {draft.medications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine Medikamente erkannt.
                  </p>
                ) : (
                  draft.medications.map((med, index) => (
                    <MedicationIntakeCard
                      key={med.id}
                      intake={med}
                      userMeds={userMeds}
                      onUpdate={(updates) => updateMedication(med.id, updates)}
                      onRemove={() => removeMedication(med.id)}
                    />
                  ))
                )}
                
                {/* Add medication button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    // TODO: Open medication picker
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Medikament hinzufügen
                </Button>
              </div>
            </DraftSection>
          )}
          
          {/* Symptoms Section */}
          {activeSections.includes('symptoms') && (
            <DraftSection
              type="symptoms"
              title={SECTION_CONFIG.symptoms.title}
              icon={SECTION_CONFIG.symptoms.icon}
              isOpen={openSections.has('symptoms')}
              onToggle={() => toggleSection('symptoms')}
              onRemove={() => removeSection('symptoms')}
              isEmpty={!draft.symptoms.value?.length}
            >
              <div className="flex flex-wrap gap-2">
                {draft.symptoms.value?.map((symptom, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {symptom}
                    <X 
                      className="h-3 w-3 cursor-pointer hover:text-destructive" 
                      onClick={() => updateSymptoms(
                        draft.symptoms.value?.filter((_, idx) => idx !== i) || []
                      )}
                    />
                  </Badge>
                ))}
                {(!draft.symptoms.value || draft.symptoms.value.length === 0) && (
                  <p className="text-sm text-muted-foreground">Keine Symptome erkannt.</p>
                )}
              </div>
            </DraftSection>
          )}
          
          {/* Triggers Section */}
          {activeSections.includes('triggers') && (
            <DraftSection
              type="triggers"
              title={SECTION_CONFIG.triggers.title}
              icon={SECTION_CONFIG.triggers.icon}
              isOpen={openSections.has('triggers')}
              onToggle={() => toggleSection('triggers')}
              onRemove={() => removeSection('triggers')}
              isEmpty={!draft.triggers.value?.length}
            >
              <div className="flex flex-wrap gap-2">
                {draft.triggers.value?.map((trigger, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {trigger}
                    <X 
                      className="h-3 w-3 cursor-pointer hover:text-destructive" 
                      onClick={() => updateTriggers(
                        draft.triggers.value?.filter((_, idx) => idx !== i) || []
                      )}
                    />
                  </Badge>
                ))}
                {(!draft.triggers.value || draft.triggers.value.length === 0) && (
                  <p className="text-sm text-muted-foreground">Keine Trigger erkannt.</p>
                )}
              </div>
            </DraftSection>
          )}
          
          {/* Notes Section */}
          {activeSections.includes('notes') && (
            <DraftSection
              type="notes"
              title={SECTION_CONFIG.notes.title}
              icon={SECTION_CONFIG.notes.icon}
              isOpen={openSections.has('notes')}
              onToggle={() => toggleSection('notes')}
              onRemove={() => removeSection('notes')}
            >
              <Textarea
                value={draft.notes.value || ''}
                onChange={(e) => updateNotes(e.target.value)}
                placeholder="Zusätzliche Notizen..."
                className="min-h-[100px]"
              />
            </DraftSection>
          )}
        </div>
        
        {/* Add section button */}
        {availableSections.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Hinzufügen:</span>
            {availableSections.map(section => (
              <Button
                key={section}
                variant="outline"
                size="sm"
                onClick={() => addSection(section)}
                className="gap-1"
              >
                <Plus className="h-3 w-3" />
                {SECTION_CONFIG[section].title}
              </Button>
            ))}
          </div>
        )}
      </div>
      
      {/* Fixed save button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t">
        <div className="container max-w-2xl mx-auto">
          <Button
            onClick={handleSave}
            disabled={!isValid || isSaving}
            className="w-full gap-2"
            size="lg"
          >
            {isSaving ? (
              <>Speichern...</>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Eintrag speichern
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Medication Intake Card Component
 */
interface MedicationIntakeCardProps {
  intake: MedicationIntake;
  userMeds: Array<{ id: string; name: string }>;
  onUpdate: (updates: Partial<MedicationIntake>) => void;
  onRemove: () => void;
}

function MedicationIntakeCard({ intake, userMeds, onUpdate, onRemove }: MedicationIntakeCardProps) {
  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="font-medium">{intake.medicationName.value}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Uhrzeit</Label>
          {intake.time.confidence === 'low' || !intake.time.value ? (
            <UncertainField hint={intake.time.originalText || 'Zeit fehlt'}>
              <Input
                type="time"
                value={intake.time.value || ''}
                onChange={(e) => onUpdate({
                  time: { value: e.target.value, confidence: 'high', source: 'user' }
                })}
                className="h-8"
              />
            </UncertainField>
          ) : (
            <Input
              type="time"
              value={intake.time.value || ''}
              onChange={(e) => onUpdate({
                time: { value: e.target.value, confidence: 'high', source: 'user' }
              })}
              className="h-8"
            />
          )}
        </div>
        
        <div className="space-y-1">
          <Label className="text-xs">Wirkung</Label>
          <Select
            value={intake.effect?.value || ''}
            onValueChange={(v) => onUpdate({
              effect: { 
                value: v as any, 
                confidence: 'high', 
                source: 'user' 
              }
            })}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Wirkung?" />
            </SelectTrigger>
            <SelectContent>
              {EFFECT_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
