import type { Reminder } from '@/types/reminder.types';

/**
 * SSOT: Compute the display title for any reminder.
 * 
 * Priority for type "appointment":
 *   1. custom_title (user-provided label) → always wins
 *   2. doctor reference → "Termin bei Dr. [Name]"
 *   3. fallback → "Termin"
 * 
 * For other types: uses existing title as-is.
 * 
 * @param reminder  The reminder object (with optional custom_title, doctor_id)
 * @param doctorName  Pre-resolved doctor display name (e.g. "Dr. Müller")
 *                    Pass null/undefined if no doctor is linked or doctor was deleted.
 */
export function getReminderDisplayTitle(
  reminder: Pick<Reminder, 'type' | 'title'> & {
    custom_title?: string | null;
    doctor_id?: string | null;
  },
  doctorName?: string | null
): string {
  // For non-appointment types, use the existing title unchanged
  if (reminder.type !== 'appointment') {
    return reminder.title || 'Erinnerung';
  }

  // 1. User-provided custom title has highest priority
  const trimmedCustom = (reminder.custom_title ?? '').trim();
  if (trimmedCustom) {
    return trimmedCustom;
  }

  // 2. Doctor reference → generate contextual title
  const trimmedDoctor = (doctorName ?? '').trim();
  if (reminder.doctor_id && trimmedDoctor) {
    return `Termin bei ${trimmedDoctor}`;
  }

  // 3. Fallback
  return 'Termin';
}

/**
 * Build a doctor display name from individual fields.
 * Handles partial data gracefully (missing title, first name, etc.)
 * 
 * Examples:
 *   - { title: "Dr.", last_name: "Müller" } → "Dr. Müller"
 *   - { first_name: "Anna", last_name: "Schmidt" } → "Anna Schmidt"
 *   - { last_name: "Weber" } → "Weber"
 *   - {} → null
 */
export function buildDoctorDisplayName(doctor: {
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): string | null {
  if (!doctor) return null;

  const parts: string[] = [];
  if (doctor.title?.trim()) parts.push(doctor.title.trim());
  if (doctor.first_name?.trim()) parts.push(doctor.first_name.trim());
  if (doctor.last_name?.trim()) parts.push(doctor.last_name.trim());

  return parts.length > 0 ? parts.join(' ') : null;
}
