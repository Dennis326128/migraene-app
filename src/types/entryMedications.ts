export interface EntryMedication {
  id: string;
  entry_id: number;
  medication_name: string;
  dosage?: string | null;
  effectiveness_rating?: number | null;
  taken_at: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEntryMedicationPayload {
  entry_id: number;
  medication_name: string;
  dosage?: string;
  effectiveness_rating?: number;
  taken_at?: string;
  notes?: string;
}

export interface EntryDefaults {
  pain_location?: string | null;
  symptom_ids: string[];
}