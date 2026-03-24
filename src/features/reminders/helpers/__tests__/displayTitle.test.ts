import { describe, it, expect } from 'vitest';
import { getReminderDisplayTitle, buildDoctorDisplayName } from '../displayTitle';

describe('getReminderDisplayTitle', () => {
  it('returns custom_title when set for appointment', () => {
    expect(getReminderDisplayTitle(
      { type: 'appointment', title: 'Arzttermin', custom_title: 'MRT Kopf' },
    )).toBe('MRT Kopf');
  });

  it('returns doctor-based title when no custom_title', () => {
    expect(getReminderDisplayTitle(
      { type: 'appointment', title: 'Arzttermin', custom_title: null, doctor_id: 'doc-1' },
      'Dr. Müller'
    )).toBe('Termin bei Dr. Müller');
  });

  it('returns "Termin" as fallback for appointment', () => {
    expect(getReminderDisplayTitle(
      { type: 'appointment', title: 'Arzttermin', custom_title: null, doctor_id: null },
    )).toBe('Termin');
  });

  it('custom_title wins over doctor name', () => {
    expect(getReminderDisplayTitle(
      { type: 'appointment', title: 'Arzttermin', custom_title: 'Botox-Termin', doctor_id: 'doc-1' },
      'Dr. Müller'
    )).toBe('Botox-Termin');
  });

  it('handles whitespace-only custom_title as empty', () => {
    expect(getReminderDisplayTitle(
      { type: 'appointment', title: 'Arzttermin', custom_title: '   ', doctor_id: 'doc-1' },
      'Dr. Müller'
    )).toBe('Termin bei Dr. Müller');
  });

  it('falls back to Termin if doctor_id set but name missing (deleted doctor)', () => {
    expect(getReminderDisplayTitle(
      { type: 'appointment', title: 'Arzttermin', custom_title: null, doctor_id: 'doc-deleted' },
      null
    )).toBe('Termin');
  });

  it('returns existing title for medication type', () => {
    expect(getReminderDisplayTitle(
      { type: 'medication', title: 'Ibuprofen einnehmen', custom_title: 'ignored' },
    )).toBe('Ibuprofen einnehmen');
  });

  it('returns existing title for todo type', () => {
    expect(getReminderDisplayTitle(
      { type: 'todo', title: 'Erinnerung' },
    )).toBe('Erinnerung');
  });

  it('handles null/undefined custom_title and doctor_id gracefully', () => {
    expect(getReminderDisplayTitle(
      { type: 'appointment', title: '' },
    )).toBe('Termin');
  });
});

describe('buildDoctorDisplayName', () => {
  it('builds "Dr. Müller" from title + last_name', () => {
    expect(buildDoctorDisplayName({ title: 'Dr.', last_name: 'Müller' })).toBe('Dr. Müller');
  });

  it('builds "Dr. med. Anna Müller" from all parts', () => {
    expect(buildDoctorDisplayName({ title: 'Dr. med.', first_name: 'Anna', last_name: 'Müller' }))
      .toBe('Dr. med. Anna Müller');
  });

  it('returns null for empty doctor', () => {
    expect(buildDoctorDisplayName({})).toBeNull();
    expect(buildDoctorDisplayName(null)).toBeNull();
    expect(buildDoctorDisplayName(undefined)).toBeNull();
  });

  it('handles whitespace-only fields', () => {
    expect(buildDoctorDisplayName({ title: '  ', last_name: 'Weber' })).toBe('Weber');
  });
});
