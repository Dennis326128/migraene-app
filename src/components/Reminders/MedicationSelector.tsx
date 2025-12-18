import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pill, Search, X, ChevronRight, Check } from 'lucide-react';
import { useMeds, useAddMed } from '@/features/meds/hooks/useMeds';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

interface MedicationSelectorProps {
  selectedMedications: string[];
  onSelectionChange: (meds: string[]) => void;
}

export const MedicationSelector = ({ selectedMedications, onSelectionChange }: MedicationSelectorProps) => {
  const { data: medications = [], isLoading } = useMeds();
  const addMed = useAddMed();
  const isMobile = useIsMobile();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [newMedicationName, setNewMedicationName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Local selection state for sheet (only applied on confirm)
  const [tempSelection, setTempSelection] = useState<string[]>([]);

  const handleToggleMedication = (medName: string) => {
    if (isMobile) {
      // Update temp selection in sheet
      if (tempSelection.includes(medName)) {
        setTempSelection(tempSelection.filter(m => m !== medName));
      } else {
        setTempSelection([...tempSelection, medName]);
      }
    } else {
      // Direct update on desktop
      if (selectedMedications.includes(medName)) {
        onSelectionChange(selectedMedications.filter(m => m !== medName));
      } else {
        onSelectionChange([...selectedMedications, medName]);
      }
    }
  };

  const handleOpenSelector = () => {
    setTempSelection([...selectedMedications]);
    setSearchQuery('');
    setIsSelectorOpen(true);
  };

  const handleConfirmSelection = () => {
    onSelectionChange(tempSelection);
    setIsSelectorOpen(false);
  };

  const handleRemoveChip = (medName: string) => {
    onSelectionChange(selectedMedications.filter(m => m !== medName));
  };

  const handleAddNewMedication = async () => {
    if (!newMedicationName.trim()) {
      toast.error('Bitte geben Sie einen Medikamentennamen ein');
      return;
    }

    try {
      await addMed.mutateAsync(newMedicationName.trim());
      if (isMobile) {
        setTempSelection([...tempSelection, newMedicationName.trim()]);
      } else {
        onSelectionChange([...selectedMedications, newMedicationName.trim()]);
      }
      toast.success('Medikament hinzugefügt');
      setNewMedicationName('');
      setIsAddDialogOpen(false);
    } catch (error) {
      toast.error('Fehler beim Hinzufügen des Medikaments');
    }
  };

  // Filter medications based on search
  const filteredMedications = medications.filter(med =>
    med.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Lade Medikamente...</div>;
  }

  // Shared medication list component
  const MedicationList = ({ selection, onToggle }: { selection: string[], onToggle: (name: string) => void }) => (
    <div className="divide-y divide-white/5">
      {filteredMedications.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          {medications.length === 0 
            ? 'Keine Medikamente vorhanden.'
            : 'Keine Medikamente gefunden.'}
        </div>
      ) : (
        filteredMedications.map((med) => {
          const isSelected = selection.includes(med.name);
          return (
            <button 
              key={med.id}
              type="button"
              className={cn(
                "w-full flex items-center gap-3 px-3 min-h-[48px] py-2 transition-colors touch-manipulation text-left",
                "hover:bg-white/5 active:bg-white/10",
                isSelected && "bg-primary/10"
              )}
              onClick={() => onToggle(med.name)}
            >
              <div className={cn(
                "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                isSelected 
                  ? "bg-primary border-primary" 
                  : "border-muted-foreground/40 bg-transparent"
              )}>
                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <Pill className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 text-sm truncate">{med.name}</span>
            </button>
          );
        })
      )}
    </div>
  );

  // Search input component
  const SearchInput = () => (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Medikament suchen..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-9 bg-white/5 border-white/10"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base">Medikamente</Label>
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

      {/* Mobile: Selector button with chips */}
      {isMobile ? (
        <div className="space-y-2">
          {/* Selected medications as chips */}
          {selectedMedications.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedMedications.map((med) => (
                <Badge 
                  key={med} 
                  variant="secondary" 
                  className="gap-1 pr-1 bg-white/10 hover:bg-white/15 border-0"
                >
                  <Pill className="h-3 w-3" />
                  <span className="max-w-[120px] truncate">{med}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveChip(med);
                    }}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-white/20 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          
          {/* Open selector button */}
          <button
            type="button"
            onClick={handleOpenSelector}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-3 py-3 rounded-lg transition-colors touch-manipulation",
              "bg-white/5 hover:bg-white/10 border border-white/10"
            )}
          >
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Pill className="h-4 w-4" />
              {selectedMedications.length === 0 
                ? 'Medikamente auswählen' 
                : `${selectedMedications.length} ausgewählt`}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>

          {/* Bottom Sheet for mobile selection */}
          <Drawer open={isSelectorOpen} onOpenChange={setIsSelectorOpen}>
            <DrawerContent className="max-h-[85vh] flex flex-col">
              <DrawerHeader className="border-b border-white/10 pb-3">
                <DrawerTitle>Medikamente auswählen</DrawerTitle>
              </DrawerHeader>
              
              {/* Sticky search */}
              <div className="px-4 py-3 border-b border-white/5 bg-background sticky top-0 z-10">
                <SearchInput />
              </div>
              
              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <MedicationList selection={tempSelection} onToggle={handleToggleMedication} />
              </div>
              
              {/* Sticky footer */}
              <DrawerFooter className="border-t border-white/10 bg-background pt-3">
                <Button
                  type="button"
                  onClick={handleConfirmSelection}
                  className="w-full"
                >
                  Übernehmen {tempSelection.length > 0 && `(${tempSelection.length})`}
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      ) : (
        /* Desktop: Inline list */
        <div className="space-y-2">
          {/* Search field if many medications */}
          {medications.length > 6 && <SearchInput />}

          {/* Medication list with subtle styling */}
          <div className="rounded-lg bg-white/5 border border-white/10 overflow-hidden">
            <div 
              className="overflow-y-auto"
              style={{ 
                maxHeight: 'min(420px, 40vh)',
                height: filteredMedications.length === 0 ? 'auto' : undefined 
              }}
            >
              <MedicationList selection={selectedMedications} onToggle={handleToggleMedication} />
            </div>
          </div>

          {selectedMedications.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {selectedMedications.length} ausgewählt
            </div>
          )}
        </div>
      )}

      {/* Add new medication dialog */}
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
