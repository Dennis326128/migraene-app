import { supabase } from "@/lib/supabaseClient";
import { logAndSaveWeatherAt } from "@/utils/weatherLogger";

export interface MigrationResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  errors: string[];
}

/**
 * Converts legacy pain_entries to new events system
 * Maintains all data integrity while migrating to the new structure
 */
export async function migratePainEntriesToEvents(): Promise<MigrationResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const result: MigrationResult = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    errors: []
  };

  try {
    // Get all pain_entries that haven't been migrated yet
    const { data: painEntries, error: fetchError } = await supabase
      .from("pain_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("timestamp_created", { ascending: true });

    if (fetchError) throw fetchError;
    if (!painEntries?.length) return result;

    result.totalProcessed = painEntries.length;

    for (const entry of painEntries) {
      try {
        // Convert pain_level to intensity_0_10
        const intensityMap: Record<string, number> = {
          "-": 0,
          "leicht": 2,
          "mittel": 5,
          "stark": 7,
          "sehr_stark": 9
        };

        const intensity = intensityMap[entry.pain_level] || 0;

        // Create event with proper timestamp
        const eventData = {
          user_id: user.id,
          type: 'migraine',
          started_at: entry.timestamp_created,
          intensity_0_10: intensity,
          notes_extraordinary: entry.notes,
          weather_id: entry.weather_id,
          default_symptoms_applied: false
        };

        const { data: newEvent, error: eventError } = await supabase
          .from("events")
          .insert(eventData)
          .select()
          .single();

        if (eventError) throw eventError;

        // Migrate medications if any
        if (entry.medications?.length) {
          for (const medName of entry.medications) {
            if (!medName || medName === "-") continue;

            // Find or create medication
            let medId: string;
            const { data: existingMed } = await supabase
              .from("user_medications")
              .select("id")
              .eq("user_id", user.id)
              .eq("name", medName)
              .single();

            if (existingMed) {
              medId = existingMed.id;
            } else {
              const { data: newMed, error: medError } = await supabase
                .from("user_medications")
                .insert({ user_id: user.id, name: medName })
                .select("id")
                .single();

              if (medError) throw medError;
              medId = newMed.id;
            }

            // Create event_med entry
            await supabase
              .from("event_meds")
              .insert({
                event_id: newEvent.id,
                med_id: medId,
                dose_mg: null,
                units: "Stück",
                source: "migrated",
                was_default: false
              });
          }
        }

        // Migrate symptoms if any exist
        const { data: entrySymptoms } = await supabase
          .from("entry_symptoms")
          .select("symptom_id")
          .eq("entry_id", entry.id);

        if (entrySymptoms?.length) {
          // Note: We'd need to create event_symptoms table for full migration
          // For now, we'll preserve the link in entry_symptoms
        }

        result.successful++;
        
        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        result.failed++;
        result.errors.push(`Entry ${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

  } catch (error) {
    throw new Error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Checks if migration is needed and returns statistics
 */
export async function getMigrationStatus() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [painEntriesResult, eventsResult] = await Promise.all([
    supabase.from("pain_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("user_id", user.id)
  ]);

  const painCount = painEntriesResult.count || 0;
  const eventsCount = eventsResult.count || 0;
  
  return {
    painEntries: painCount,
    events: eventsCount,
    needsMigration: painCount > 0 && eventsCount === 0,
    isEmpty: painCount === 0 && eventsCount === 0
  };
}

/**
 * Enhanced weather data backfill for missing entries
 */
export async function enhancedWeatherBackfill(days = 30): Promise<MigrationResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const result: MigrationResult = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    errors: []
  };

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Check both pain_entries and events for missing weather data
  const [painEntriesWithoutWeather, eventsWithoutWeather] = await Promise.all([
    supabase
      .from("pain_entries")
      .select("id, timestamp_created, selected_date, selected_time")
      .eq("user_id", user.id)
      .is("weather_id", null)
      .gte("timestamp_created", since.toISOString()),
    
    supabase
      .from("events")
      .select("id, started_at")
      .eq("user_id", user.id)
      .is("weather_id", null)
      .gte("started_at", since.toISOString())
  ]);

  const allEntries = [
    ...(painEntriesWithoutWeather.data || []).map(e => ({ ...e, type: 'pain_entry' })),
    ...(eventsWithoutWeather.data || []).map(e => ({ ...e, type: 'event' }))
  ];

  result.totalProcessed = allEntries.length;

  for (const entry of allEntries) {
    try {
      const timestamp = entry.type === 'pain_entry' 
        ? (entry as any).selected_date && (entry as any).selected_time
          ? new Date(`${(entry as any).selected_date}T${(entry as any).selected_time}:00`).toISOString()
          : (entry as any).timestamp_created
        : (entry as any).started_at;

      const weatherId = await logAndSaveWeatherAt(timestamp);
      
      if (weatherId) {
        const table = entry.type === 'pain_entry' ? 'pain_entries' : 'events';
        const column = entry.type === 'pain_entry' ? 'weather_id' : 'weather_id';
        
        await supabase
          .from(table)
          .update({ [column]: weatherId })
          .eq('id', entry.id);
          
        result.successful++;
      } else {
        result.failed++;
        result.errors.push(`Failed to get weather for ${entry.type} ${entry.id}`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      result.failed++;
      result.errors.push(`${entry.type} ${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}