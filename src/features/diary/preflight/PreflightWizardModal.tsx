import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, Clock, XCircle } from "lucide-react";
import type { MissingItem } from "./types";
import type { PatientData, Doctor } from "@/features/account/hooks/useAccount";
import { useUpsertPatientData } from "@/features/account/hooks/useAccount";
import { toast } from "sonner";

interface PreflightWizardModalProps {
  open: boolean;
  currentItem: MissingItem | null;
  currentIndex: number;
  totalItems: number;
  patientData: PatientData | null;
  onLater: () => void;
  onNeverAsk: () => void;
  onDataSaved: () => void;
  onNavigateToSettings: (target: 'personal' | 'doctors') => void;
  onCancel: () => void;
}

export function PreflightWizardModal({
  open,
  currentItem,
  currentIndex,
  totalItems,
  patientData,
  onLater,
  onNeverAsk,
  onDataSaved,
  onNavigateToSettings,
  onCancel,
}: PreflightWizardModalProps) {
  if (!currentItem) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md">
        {/* Progress indicator */}
        {totalItems > 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>Schritt {currentIndex + 1} von {totalItems}</span>
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all"
                style={{ width: `${((currentIndex + 1) / totalItems) * 100}%` }}
              />
            </div>
          </div>
        )}
        
        {currentItem.type === 'personalFieldInsuranceNumber' && (
          <InsuranceNumberStep
            patientData={patientData}
            onLater={onLater}
            onNeverAsk={onNeverAsk}
            onDataSaved={onDataSaved}
          />
        )}
        
        {currentItem.type === 'personalFieldDateOfBirth' && (
          <DateOfBirthStep
            patientData={patientData}
            onLater={onLater}
            onNeverAsk={onNeverAsk}
            onDataSaved={onDataSaved}
          />
        )}
        
        {currentItem.type === 'personalDataComplete' && (
          <PersonalDataCompleteStep
            onLater={onLater}
            onNeverAsk={onNeverAsk}
            onNavigateToSettings={() => onNavigateToSettings('personal')}
          />
        )}
        
        {currentItem.type === 'doctors' && (
          <DoctorsStep
            onLater={onLater}
            onNeverAsk={onNeverAsk}
            onNavigateToSettings={() => onNavigateToSettings('doctors')}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============= STEP COMPONENTS =============

interface StepFooterProps {
  onLater: () => void;
  onNeverAsk: () => void;
}

function StepFooter({ onLater, onNeverAsk }: StepFooterProps) {
  return (
    <>
      <DialogFooter className="flex-col sm:flex-row gap-2">
        <Button variant="outline" onClick={onLater} className="w-full sm:w-auto">
          <Clock className="h-4 w-4 mr-2" />
          Später
        </Button>
      </DialogFooter>
      <div className="text-center mt-2">
        <button
          onClick={onNeverAsk}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Nie mehr fragen
        </button>
        <p className="text-xs text-muted-foreground mt-1">
          Du kannst das in Einstellungen jederzeit ändern.
        </p>
      </div>
    </>
  );
}

// Insurance Number Step (inline input)
interface InsuranceNumberStepProps {
  patientData: PatientData | null;
  onLater: () => void;
  onNeverAsk: () => void;
  onDataSaved: () => void;
}

function InsuranceNumberStep({ patientData, onLater, onNeverAsk, onDataSaved }: InsuranceNumberStepProps) {
  const [value, setValue] = useState("");
  const [showInput, setShowInput] = useState(false);
  const upsertPatient = useUpsertPatientData();

  const handleSave = async () => {
    if (!value.trim()) {
      toast.error("Bitte gib deine Versichertennummer ein");
      return;
    }
    
    try {
      await upsertPatient.mutateAsync({
        insurance_number: value.trim(),
      });
      toast.success("Versichertennummer gespeichert");
      onDataSaved();
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  if (showInput) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Versichertennummer eingeben</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="insuranceNumber">Versichertennummer</Label>
            <Input
              id="insuranceNumber"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="z.B. A123456789"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setShowInput(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={upsertPatient.isPending}>
            {upsertPatient.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Noch schnell ergänzen?</DialogTitle>
        <DialogDescription>
          Möchtest du deine Versichertennummer eingeben? Das hilft, dein Tagebuch später besser exportieren und teilen zu können.
        </DialogDescription>
      </DialogHeader>
      <div className="py-4">
        <Button onClick={() => setShowInput(true)} className="w-full">
          <ArrowRight className="h-4 w-4 mr-2" />
          Ja, jetzt eingeben
        </Button>
      </div>
      <StepFooter onLater={onLater} onNeverAsk={onNeverAsk} />
    </>
  );
}

// Date of Birth Step (inline input)
interface DateOfBirthStepProps {
  patientData: PatientData | null;
  onLater: () => void;
  onNeverAsk: () => void;
  onDataSaved: () => void;
}

function DateOfBirthStep({ patientData, onLater, onNeverAsk, onDataSaved }: DateOfBirthStepProps) {
  const [value, setValue] = useState("");
  const [showInput, setShowInput] = useState(false);
  const upsertPatient = useUpsertPatientData();

  const handleSave = async () => {
    if (!value) {
      toast.error("Bitte gib dein Geburtsdatum ein");
      return;
    }
    
    try {
      await upsertPatient.mutateAsync({
        date_of_birth: value,
      });
      toast.success("Geburtsdatum gespeichert");
      onDataSaved();
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  if (showInput) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Geburtsdatum eingeben</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Geburtsdatum</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setShowInput(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={upsertPatient.isPending}>
            {upsertPatient.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Noch schnell ergänzen?</DialogTitle>
        <DialogDescription>
          Möchtest du dein Geburtsdatum eingeben? Das ist wichtig für medizinische Berichte.
        </DialogDescription>
      </DialogHeader>
      <div className="py-4">
        <Button onClick={() => setShowInput(true)} className="w-full">
          <ArrowRight className="h-4 w-4 mr-2" />
          Ja, jetzt eingeben
        </Button>
      </div>
      <StepFooter onLater={onLater} onNeverAsk={onNeverAsk} />
    </>
  );
}

// Personal Data Complete Step (navigate to settings)
interface PersonalDataCompleteStepProps {
  onLater: () => void;
  onNeverAsk: () => void;
  onNavigateToSettings: () => void;
}

function PersonalDataCompleteStep({ onLater, onNeverAsk, onNavigateToSettings }: PersonalDataCompleteStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Persönliche Daten hinzufügen?</DialogTitle>
        <DialogDescription>
          Möchtest du deine persönlichen Daten (Name, Adresse, etc.) ergänzen? Das macht dein Tagebuch vollständiger für Arztbesuche.
        </DialogDescription>
      </DialogHeader>
      <div className="py-4">
        <Button onClick={onNavigateToSettings} className="w-full">
          <ArrowRight className="h-4 w-4 mr-2" />
          Jetzt ergänzen
        </Button>
      </div>
      <StepFooter onLater={onLater} onNeverAsk={onNeverAsk} />
    </>
  );
}

// Doctors Step (navigate to settings)
interface DoctorsStepProps {
  onLater: () => void;
  onNeverAsk: () => void;
  onNavigateToSettings: () => void;
}

function DoctorsStep({ onLater, onNeverAsk, onNavigateToSettings }: DoctorsStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Behandelnden Arzt hinzufügen?</DialogTitle>
        <DialogDescription>
          Möchtest du einen behandelnden Arzt hinterlegen? Das ist optional, hilft aber bei Berichten für Arztpraxis oder Krankenkasse.
        </DialogDescription>
      </DialogHeader>
      <div className="py-4">
        <Button onClick={onNavigateToSettings} className="w-full">
          <ArrowRight className="h-4 w-4 mr-2" />
          Jetzt hinzufügen
        </Button>
      </div>
      <StepFooter onLater={onLater} onNeverAsk={onNeverAsk} />
    </>
  );
}
