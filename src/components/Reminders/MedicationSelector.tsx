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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newMedicationName, setNewMedicationName] = useState('');
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
    const name = newMedicationName.trim();
    if (!name) {
      toast.error('Bitte geben Sie einen Medikamentennamen ein');
      return;
    }

    try {
      await addMed.mutateAsync(name);
      // Auto-select the new medication
      onSelectionChange([...selectedMedications, name]);
      toast.success('Medikament hinzugefügt');
      setNewMedicationName('');
      setIsAddDialogOpen(false);
    } catch (error) {
      toast.error('Fehler beim Hinzufügen des Medikaments');
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Lade Medikamente...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Medikamente</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsAddDialogOpen(true)}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Neu
        </Button>
      </div>

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

      {/* Add new medication dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neues Medikament hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="med-name">Medikamentenname *</Label>
              <Input
                id="med-name"
                value={newMedicationName}
                onChange={(e) => setNewMedicationName(e.target.value)}
                placeholder="z.B. Aspirin"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddNewMedication();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setNewMedicationName('');
              }}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={handleAddNewMedication}
              disabled={addMed.isPending}
            >
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
