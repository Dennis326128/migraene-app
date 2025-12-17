/**
 * Demo Data Seeding Logic
 * Creates realistic test data for the demo user
 */

import { supabase } from '@/integrations/supabase/client';
import { DEMO_CONFIG, DEMO_DOCTORS, DEMO_MEDICATIONS, isDemoEnabled } from './demoConfig';
import { SeededRandom } from './pseudoRandom';
import { format, subDays, addMinutes, startOfDay } from 'date-fns';

type ProgressCallback = (message: string, percent: number) => void;

interface MedicationRecord {
  id: string;
  name: string;
}

// Pain level mapping for the app
const PAIN_LEVELS = ['keine', 'leicht', 'mittel', 'stark', 'sehr stark'] as const;
const AURA_TYPES = ['keine', 'visuell', 'sensorisch', 'motorisch', 'sprachlich'] as const;
const PAIN_LOCATIONS = ['einseitig links', 'einseitig rechts', 'beidseitig', 'Stirn', 'Hinterkopf', 'Nacken'] as const;

const TRIGGERS = [
  'Schlafmangel', 'Stress', 'Wetterumschwung', 'zu wenig getrunken', 
  'Nackenverspannung', 'Bildschirmarbeit', 'Alkohol', 'Koffeinentzug',
  'unregelmäßige Mahlzeiten', 'grelles Licht'
] as const;

const SYMPTOMS = [
  'Übelkeit', 'Lichtempfindlichkeit', 'Geräuschempfindlichkeit', 
  'Erbrechen', 'Schwindel', 'Konzentrationsstörung'
] as const;

export async function resetDemoData(userId: string, onProgress?: ProgressCallback): Promise<void> {
  if (!isDemoEnabled()) {
    throw new Error('Demo mode is not enabled');
  }

  onProgress?.('Lösche vorhandene Demo-Daten...', 0);

  // Delete in correct order (dependencies first)
  await supabase.from('medication_effects').delete().eq('entry_id', -1).or(`entry_id.in.(select id from pain_entries where user_id = '${userId}')`);
  await supabase.from('pain_entries').delete().eq('user_id', userId);
  await supabase.from('reminders').delete().eq('user_id', userId);
  await supabase.from('medication_courses').delete().eq('user_id', userId);
  await supabase.from('user_medications').delete().eq('user_id', userId);
  await supabase.from('doctors').delete().eq('user_id', userId);
  
  onProgress?.('Vorhandene Daten gelöscht', 10);
}

export async function seedDemoData(userId: string, onProgress?: ProgressCallback): Promise<{ entriesCount: number }> {
  if (!isDemoEnabled()) {
    throw new Error('Demo mode is not enabled');
  }

  const rng = new SeededRandom(DEMO_CONFIG.seed);
  
  // 1. Seed patient data (upsert to user_profiles won't work - use patient_data)
  onProgress?.('Erstelle Patientenprofil...', 15);
  await seedPatientData(userId);

  // 2. Seed doctors
  onProgress?.('Erstelle Ärzte...', 20);
  await seedDoctors(userId);

  // 3. Seed medications
  onProgress?.('Erstelle Medikamente...', 30);
  const medications = await seedMedications(userId);

  // 4. Seed medication courses
  onProgress?.('Erstelle Medikations-Kurse...', 40);
  await seedMedicationCourses(userId, medications);

  // 5. Seed reminders
  onProgress?.('Erstelle Erinnerungen...', 50);
  await seedReminders(userId, medications);

  // 6. Seed pain entries (the big one)
  onProgress?.('Erstelle Tagebuch-Einträge...', 60);
  const entriesCount = await seedPainEntries(userId, medications, rng, onProgress);

  onProgress?.('Demo-Daten erfolgreich erstellt!', 100);
  
  return { entriesCount };
}

async function seedPatientData(userId: string): Promise<void> {
  const { profile } = DEMO_CONFIG;
  
  const { error } = await supabase.from('patient_data').upsert({
    user_id: userId,
    first_name: profile.first_name,
    last_name: profile.last_name,
    date_of_birth: profile.date_of_birth,
    street: profile.street,
    postal_code: profile.postal_code,
    city: profile.city,
    phone: profile.phone,
    health_insurance: profile.health_insurance,
    salutation: profile.salutation,
    title: profile.title,
  }, { onConflict: 'user_id' });

  if (error) throw new Error(`Failed to seed patient data: ${error.message}`);
}

async function seedDoctors(userId: string): Promise<void> {
  const doctorsWithUserId = DEMO_DOCTORS.map(doc => ({
    ...doc,
    user_id: userId,
  }));

  const { error } = await supabase.from('doctors').insert(doctorsWithUserId);
  if (error) throw new Error(`Failed to seed doctors: ${error.message}`);
}

async function seedMedications(userId: string): Promise<MedicationRecord[]> {
  const allMeds = [...DEMO_MEDICATIONS.prophylaxis, ...DEMO_MEDICATIONS.acute];
  
  const medsWithUserId = allMeds.map(med => ({
    user_id: userId,
    name: med.name,
    wirkstoff: med.wirkstoff,
    staerke: med.staerke,
    darreichungsform: med.darreichungsform,
    einheit: med.einheit,
    intake_type: med.intake_type,
    art: med.art,
    effect_category: med.effect_category,
    typical_indication: med.typical_indication,
    hinweise: med.hinweise,
    dosis_morgens: 'dosis_morgens' in med ? med.dosis_morgens : null,
    dosis_abends: 'dosis_abends' in med ? med.dosis_abends : null,
    as_needed_standard_dose: 'as_needed_standard_dose' in med ? med.as_needed_standard_dose : null,
    as_needed_max_per_24h: 'as_needed_max_per_24h' in med ? med.as_needed_max_per_24h : null,
    as_needed_min_interval_hours: 'as_needed_min_interval_hours' in med ? med.as_needed_min_interval_hours : null,
    as_needed_max_days_per_month: 'as_needed_max_days_per_month' in med ? med.as_needed_max_days_per_month : null,
    regular_weekdays: 'regular_weekdays' in med ? med.regular_weekdays : null,
    regular_notes: 'regular_notes' in med ? med.regular_notes : null,
    is_active: true,
    medication_status: 'active',
  }));

  const { data, error } = await supabase.from('user_medications').insert(medsWithUserId).select('id, name');
  if (error) throw new Error(`Failed to seed medications: ${error.message}`);
  
  return data || [];
}

async function seedMedicationCourses(userId: string, medications: MedicationRecord[]): Promise<void> {
  const prophylaxeMeds = ['Fremanezumab (Ajovy)', 'Metoprolol', 'Magnesiumcitrat'];
  const courses = [];

  for (const medName of prophylaxeMeds) {
    const med = medications.find(m => m.name === medName);
    if (med) {
      courses.push({
        user_id: userId,
        medication_id: med.id,
        medication_name: med.name,
        type: 'prophylaxe',
        start_date: format(subDays(new Date(), 180), 'yyyy-MM-dd'),
        is_active: true,
        baseline_migraine_days: '8-10',
        baseline_impairment_level: 'mittel',
        note_for_physician: 'DEMO – Prophylaxe seit 6 Monaten',
      });
    }
  }

  if (courses.length > 0) {
    const { error } = await supabase.from('medication_courses').insert(courses);
    if (error) throw new Error(`Failed to seed medication courses: ${error.message}`);
  }
}

async function seedReminders(userId: string, medications: MedicationRecord[]): Promise<void> {
  const today = new Date();
  const reminders = [];

  // Metoprolol - daily 08:00
  const metoprolol = medications.find(m => m.name === 'Metoprolol');
  if (metoprolol) {
    reminders.push({
      user_id: userId,
      title: 'Metoprolol einnehmen',
      type: 'medication',
      date_time: format(startOfDay(today), "yyyy-MM-dd") + 'T08:00:00',
      repeat: 'daily',
      status: 'pending',
      medications: [metoprolol.name],
      notification_enabled: true,
      time_of_day: 'morgens',
    });
  }

  // Magnesium - daily 21:00
  const magnesium = medications.find(m => m.name === 'Magnesiumcitrat');
  if (magnesium) {
    reminders.push({
      user_id: userId,
      title: 'Magnesium einnehmen',
      type: 'medication',
      date_time: format(startOfDay(today), "yyyy-MM-dd") + 'T21:00:00',
      repeat: 'daily',
      status: 'pending',
      medications: [magnesium.name],
      notification_enabled: true,
      time_of_day: 'abends',
    });
  }

  // Eliquis - daily 08:00 and 20:00
  const eliquis = medications.find(m => m.name === 'Eliquis');
  if (eliquis) {
    reminders.push({
      user_id: userId,
      title: 'Eliquis morgens',
      type: 'medication',
      date_time: format(startOfDay(today), "yyyy-MM-dd") + 'T08:00:00',
      repeat: 'daily',
      status: 'pending',
      medications: [eliquis.name],
      notification_enabled: true,
      time_of_day: 'morgens',
    });
    reminders.push({
      user_id: userId,
      title: 'Eliquis abends',
      type: 'medication',
      date_time: format(startOfDay(today), "yyyy-MM-dd") + 'T20:00:00',
      repeat: 'daily',
      status: 'pending',
      medications: [eliquis.name],
      notification_enabled: true,
      time_of_day: 'abends',
    });
  }

  // Ajovy - monthly
  const ajovy = medications.find(m => m.name === 'Fremanezumab (Ajovy)');
  if (ajovy) {
    reminders.push({
      user_id: userId,
      title: 'Ajovy Injektion',
      type: 'medication',
      date_time: format(subDays(today, 25), "yyyy-MM-dd") + 'T09:00:00',
      repeat: 'monthly',
      status: 'pending',
      medications: [ajovy.name],
      notification_enabled: true,
      notes: 'Monatliche Prophylaxe-Injektion',
    });
  }

  if (reminders.length > 0) {
    const { error } = await supabase.from('reminders').insert(reminders);
    if (error) throw new Error(`Failed to seed reminders: ${error.message}`);
  }
}

async function seedPainEntries(
  userId: string, 
  medications: MedicationRecord[], 
  rng: SeededRandom,
  onProgress?: ProgressCallback
): Promise<number> {
  const today = startOfDay(new Date());
  const entries: any[] = [];
  
  // Find medication IDs for quick lookup
  const medLookup = new Map(medications.map(m => [m.name, m.id]));
  const sumatriptan = medications.find(m => m.name === 'Sumatriptan');
  const ibuprofen = medications.find(m => m.name === 'Ibuprofen');
  const naproxen = medications.find(m => m.name === 'Naproxen');
  const metoclopramid = medications.find(m => m.name === 'Metoclopramid');

  let migraineThisMonth = 0;
  let lastMigraineDay = -10;

  for (let dayOffset = DEMO_CONFIG.daysToGenerate; dayOffset >= 1; dayOffset--) {
    const entryDate = subDays(today, dayOffset);
    const dateStr = format(entryDate, 'yyyy-MM-dd');
    
    // Reset monthly counter
    if (entryDate.getDate() === 1) {
      migraineThisMonth = 0;
    }

    // Morning check-in (always)
    const morningEntry = createMorningCheckin(userId, dateStr, rng);
    entries.push(morningEntry);

    // Determine day type
    const daysSinceLastMigraine = dayOffset - lastMigraineDay;
    const canHaveMigraine = daysSinceLastMigraine >= 2 && migraineThisMonth < 8;
    
    // Migraine day (~30% chance)
    if (canHaveMigraine && rng.chance(0.30)) {
      lastMigraineDay = dayOffset;
      migraineThisMonth++;
      
      const migraineEntries = createMigraineDay(
        userId, dateStr, rng, 
        sumatriptan, ibuprofen, naproxen, metoclopramid,
        medLookup
      );
      entries.push(...migraineEntries);
    }
    // Tension headache day (~20% chance on non-migraine days)
    else if (rng.chance(0.20)) {
      const tensionEntry = createTensionHeadacheEntry(
        userId, dateStr, rng, ibuprofen, medLookup
      );
      entries.push(tensionEntry);
    }

    // Special entries (rare)
    if (rng.chance(0.02)) {
      entries.push(createDoctorVisitEntry(userId, dateStr, rng));
    }
    if (rng.chance(0.10)) {
      entries.push(createExerciseEntry(userId, dateStr, rng));
    }
  }

  // Insert in batches
  const batchSize = DEMO_CONFIG.batchSize;
  let inserted = 0;
  
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const { error } = await supabase.from('pain_entries').insert(batch);
    if (error) throw new Error(`Failed to insert entries batch: ${error.message}`);
    
    inserted += batch.length;
    const percent = 60 + Math.floor((inserted / entries.length) * 35);
    onProgress?.(`Einträge: ${inserted}/${entries.length}`, percent);
  }

  return entries.length;
}

function createMorningCheckin(userId: string, dateStr: string, rng: SeededRandom): any {
  const sleepHours = rng.nextInt(5, 8);
  const stressLevel = rng.pick(['niedrig', 'mittel', 'hoch']);
  const hydration = rng.pick(['gut', 'ok', 'zu wenig']);
  
  let notes = `Schlaf: ${sleepHours}h, Stress: ${stressLevel}`;
  if (hydration === 'zu wenig') notes += ', wenig getrunken';
  if (rng.chance(0.3)) notes += `, ${rng.nextInt(1, 3)} Kaffee`;

  return {
    user_id: userId,
    selected_date: dateStr,
    selected_time: '07:30:00',
    pain_level: rng.pick(['keine', 'keine', 'leicht']),
    aura_type: 'keine',
    pain_location: null,
    medications: [],
    medication_ids: [],
    notes,
  };
}

function createMigraineDay(
  userId: string,
  dateStr: string,
  rng: SeededRandom,
  sumatriptan: MedicationRecord | undefined,
  ibuprofen: MedicationRecord | undefined,
  naproxen: MedicationRecord | undefined,
  metoclopramid: MedicationRecord | undefined,
  medLookup: Map<string, string>
): any[] {
  const entries: any[] = [];
  
  // Main attack entry
  const startHour = rng.nextInt(10, 14);
  const painLevel = rng.pick(['stark', 'stark', 'sehr stark']);
  const hasAura = rng.chance(0.12);
  const hasNausea = rng.chance(0.6);
  
  const symptoms: string[] = [];
  if (hasNausea) symptoms.push('Übelkeit');
  symptoms.push('Lichtempfindlichkeit', 'Geräuschempfindlichkeit');
  if (rng.chance(0.2)) symptoms.push('Schwindel');

  const triggers = rng.pickMultiple(TRIGGERS, rng.nextInt(1, 3));
  
  const meds: string[] = [];
  const medIds: string[] = [];
  
  // Add Metoclopramid if nausea
  if (hasNausea && metoclopramid && rng.chance(0.7)) {
    meds.push(metoclopramid.name);
    medIds.push(metoclopramid.id);
  }
  
  // Primary: Sumatriptan
  if (sumatriptan && rng.chance(0.85)) {
    meds.push(sumatriptan.name);
    medIds.push(sumatriptan.id);
  }
  
  // Sometimes add NSAID later
  const addNsaid = rng.chance(0.3);
  if (addNsaid) {
    const nsaid = rng.chance(0.6) ? ibuprofen : naproxen;
    if (nsaid) {
      meds.push(nsaid.name);
      medIds.push(nsaid.id);
    }
  }

  let notes = `Migräneattacke seit ${startHour}:00 Uhr`;
  if (hasAura) notes = `Mit Aura. ${notes}`;
  notes += `. Trigger: ${triggers.join(', ')}`;
  if (meds.length > 0) {
    const relief = rng.pick(['Besserung nach 45 Min', 'Besserung nach 90 Min', 'nur teilweise Linderung']);
    notes += `. ${relief}`;
  }

  entries.push({
    user_id: userId,
    selected_date: dateStr,
    selected_time: `${startHour.toString().padStart(2, '0')}:30:00`,
    pain_level: painLevel,
    aura_type: hasAura ? rng.pick(['visuell', 'sensorisch']) : 'keine',
    pain_location: rng.pick(PAIN_LOCATIONS),
    medications: meds,
    medication_ids: medIds,
    notes,
  });

  // Evening follow-up entry (~70% chance)
  if (rng.chance(0.7)) {
    const eveningHour = rng.nextInt(18, 22);
    const residualPain = rng.pick(['leicht', 'leicht', 'mittel']);
    
    entries.push({
      user_id: userId,
      selected_date: dateStr,
      selected_time: `${eveningHour}:00:00`,
      pain_level: residualPain,
      aura_type: 'keine',
      pain_location: rng.pick(PAIN_LOCATIONS),
      medications: [],
      medication_ids: [],
      notes: `Abend: Restschmerz ${residualPain}. ${rng.pick(['Ruhe geholfen', 'früh ins Bett', 'noch erschöpft'])}`,
    });
  }

  return entries;
}

function createTensionHeadacheEntry(
  userId: string,
  dateStr: string,
  rng: SeededRandom,
  ibuprofen: MedicationRecord | undefined,
  medLookup: Map<string, string>
): any {
  const hour = rng.nextInt(14, 18);
  const painLevel = rng.pick(['leicht', 'mittel', 'mittel']);
  
  const meds: string[] = [];
  const medIds: string[] = [];
  
  if (ibuprofen && rng.chance(0.5)) {
    meds.push(ibuprofen.name);
    medIds.push(ibuprofen.id);
  }

  const notes = rng.pick([
    'Spannungskopfschmerz, Nacken/Schulter verspannt',
    'Dumpfer Druck, beidseitig',
    'Leichte Kopfschmerzen nach Bildschirmarbeit',
    'Kopfschmerzen, vermutlich Wetterfühligkeit',
  ]);

  return {
    user_id: userId,
    selected_date: dateStr,
    selected_time: `${hour}:00:00`,
    pain_level: painLevel,
    aura_type: 'keine',
    pain_location: rng.pick(['beidseitig', 'Stirn', 'Nacken']),
    medications: meds,
    medication_ids: medIds,
    notes,
  };
}

function createDoctorVisitEntry(userId: string, dateStr: string, rng: SeededRandom): any {
  return {
    user_id: userId,
    selected_date: dateStr,
    selected_time: '10:00:00',
    pain_level: 'keine',
    aura_type: 'keine',
    pain_location: null,
    medications: [],
    medication_ids: [],
    notes: rng.pick([
      'Neurologie-Termin: Therapie besprochen, Prophylaxe beibehalten',
      'Hausarzt: Blutdruck kontrolliert, alles okay',
      'Neurologie: MRT-Befund unauffällig',
    ]),
  };
}

function createExerciseEntry(userId: string, dateStr: string, rng: SeededRandom): any {
  return {
    user_id: userId,
    selected_date: dateStr,
    selected_time: rng.pick(['07:00:00', '18:00:00', '19:00:00']),
    pain_level: 'keine',
    aura_type: 'keine',
    pain_location: null,
    medications: [],
    medication_ids: [],
    notes: rng.pick([
      'Sport/Yoga – danach entspannt',
      '30 Min Spaziergang, frische Luft gut',
      'Nackenübungen gemacht',
      'Schwimmen – Kopf frei',
    ]),
  };
}
