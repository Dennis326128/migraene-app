/**
 * MedicationSelector for Reminders
 * 
 * Uses the same pill/selectable-item pattern as the pain entry medication selection.
 * No dose chips, no "recently used" section, alphabetical sort, search, inline add.
 */

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Plus, Pill, Check } from 'lucide-react';
import { useMeds, useAddMed } from '@/features/meds/hooks/useMeds';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MedicationSelectorProps {
  selectedMedications: string[];
  onSelectionChange: (meds: string[]) => void;
}

export const MedicationSelector = ({ selectedMedications, onSelectionChange }: MedicationSelectorProps) => {
  const { data: medications = [], isLoading } = useMeds();
  const addMed = useAddMed();
  const [newMedication, setNewMedication] = useState('');
  // Alphabetically sorted medications
  const sortedMedications = useMemo(() => {
    return [...medications].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [medications]);

  const handleToggleMedication = (medName: string) => {
    if (selectedMedications.includes(medName)) {
      onSelectionChange(selectedMedications.filter(m => m !== medName));
    } else {
      onSelectionChange([...selectedMedications, medName]);
    }
  };

  const handleAddNewMedication = async () => {
    const name = newMedication.trim();
    if (!name) return;

    // Check for duplicates (case-insensitive)
    const existing = medications.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      // Just select the existing one
      if (!selectedMedications.includes(existing.name)) {
        onSelectionChange([...selectedMedications, existing.name]);
      }
      setNewMedication('');
      return;
    }

    try {
      await addMed.mutateAsync(name);
      onSelectionChange([...selectedMedications, name]);
      setNewMedication('');
    } catch {
      toast.error('Fehler beim Hinzufügen');
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Lade Medikamente...</div>;
  }

  return (
    <div className="space-y-3">
      <Label className="text-base font-medium">Medikamente</Label>

      {/* Medication pills - same pattern as pain entry */}
      <div
        className="space-y-1.5 overflow-y-auto"
        style={{ maxHeight: 'min(420px, 40vh)' }}
      >
        {sortedMedications.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            Keine Medikamente vorhanden.
          </div>
        ) : (
          sortedMedications.map((med) => {
            const isSelected = selectedMedications.includes(med.name);
            return (
              <Button
                key={med.id}
                type="button"
                variant="outline"
                className={cn(
                  "h-auto min-h-[2.75rem] py-2 px-3 justify-start w-full gap-2",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground"
                    : "border-border/50 hover:bg-muted/50"
                )}
                onClick={() => handleToggleMedication(med.name)}
              >
                {isSelected && <Check className="h-4 w-4 flex-shrink-0" />}
                <Pill className={cn("h-4 w-4 flex-shrink-0", !isSelected && "text-muted-foreground")} />
                <span className="truncate text-left">{med.name}</span>
              </Button>
            );
          })
        )}
      </div>

      {selectedMedications.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedMedications.length} ausgewählt
        </p>
      )}

      {/* Inline add – identical pattern to NewEntry.tsx */}
      <div className="flex gap-2">
        <Input
          placeholder="Neues Medikament eingeben..."
          value={newMedication}
          onChange={(e) => setNewMedication(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddNewMedication())}
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleAddNewMedication}
          disabled={!newMedication.trim() || addMed.isPending}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
