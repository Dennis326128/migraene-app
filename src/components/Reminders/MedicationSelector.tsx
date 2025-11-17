import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pill } from 'lucide-react';
import { useMeds, useAddMed } from '@/features/meds/hooks/useMeds';
import { toast } from 'sonner';

interface MedicationSelectorProps {
  selectedMedications: string[];
  onSelectionChange: (meds: string[]) => void;
}

export const MedicationSelector = ({ selectedMedications, onSelectionChange }: MedicationSelectorProps) => {
  const { data: medications = [], isLoading } = useMeds();
  const addMed = useAddMed();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newMedicationName, setNewMedicationName] = useState('');

  const handleToggleMedication = (medName: string) => {
    if (selectedMedications.includes(medName)) {
      onSelectionChange(selectedMedications.filter(m => m !== medName));
    } else {
      onSelectionChange([...selectedMedications, medName]);
    }
  };

  const handleAddNewMedication = async () => {
    if (!newMedicationName.trim()) {
      toast.error('Bitte geben Sie einen Medikamentennamen ein');
      return;
    }

    try {
      await addMed.mutateAsync(newMedicationName.trim());
      onSelectionChange([...selectedMedications, newMedicationName.trim()]);
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
        <Label className="text-base">Medikamente</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsAddDialogOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Hinzufügen
        </Button>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
        {medications.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            Keine Medikamente vorhanden. Fügen Sie ein neues hinzu.
          </div>
        ) : (
          medications.map((med) => (
            <div key={med.id} className="flex items-center space-x-2">
              <Checkbox
                id={`med-${med.id}`}
                checked={selectedMedications.includes(med.name)}
                onCheckedChange={() => handleToggleMedication(med.name)}
              />
              <Label
                htmlFor={`med-${med.id}`}
                className="text-sm font-normal cursor-pointer flex items-center gap-2"
              >
                <Pill className="h-4 w-4 text-muted-foreground" />
                {med.name}
              </Label>
            </div>
          ))
        )}
      </div>

      {selectedMedications.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Ausgewählt: {selectedMedications.join(', ')}
        </div>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Medikament hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="med-name">Medikamentenname</Label>
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