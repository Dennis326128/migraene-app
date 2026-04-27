export interface MedicationIntakeUsageRow {
  entry_id?: number | null;
  medication_name?: string | null;
  taken_date?: string | null;
  taken_at?: string | null;
}

export interface LegacyMedicationEntryUsageRow {
  id?: number | null;
  selected_date?: string | null;
  timestamp_created?: string | null;
  medications?: string[] | null;
}

export function normalizeMedicationNameForUsage(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/µ/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

export function getMedicationUsageDate(row: { taken_date?: string | null; taken_at?: string | null; selected_date?: string | null; timestamp_created?: string | null }): string | null {
  return row.taken_date
    || row.selected_date
    || (row.taken_at ? row.taken_at.substring(0, 10) : null)
    || (row.timestamp_created ? row.timestamp_created.substring(0, 10) : null);
}

export function countMedicationUsageInRange(
  medicationName: string,
  from: string,
  to: string,
  intakes: MedicationIntakeUsageRow[],
  legacyEntries: LegacyMedicationEntryUsageRow[] = [],
): number {
  const target = normalizeMedicationNameForUsage(medicationName);
  if (!target) return 0;

  let count = 0;
  const intakeEntryMedicationKeys = new Set<string>();

  for (const intake of intakes) {
    const date = getMedicationUsageDate(intake);
    if (!date || date < from || date > to) continue;
    const normalizedName = normalizeMedicationNameForUsage(intake.medication_name);
    if (normalizedName !== target) continue;
    count++;
    if (intake.entry_id != null) {
      intakeEntryMedicationKeys.add(`${intake.entry_id}:${normalizedName}`);
    }
  }

  for (const entry of legacyEntries) {
    const date = getMedicationUsageDate(entry);
    if (!date || date < from || date > to) continue;

    for (const legacyName of entry.medications || []) {
      const normalizedName = normalizeMedicationNameForUsage(legacyName);
      if (normalizedName !== target) continue;

      const key = entry.id != null ? `${entry.id}:${normalizedName}` : null;
      if (key && intakeEntryMedicationKeys.has(key)) continue;
      count++;
    }
  }

  return count;
}