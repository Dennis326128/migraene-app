import { supabase } from "@/integrations/supabase/client";
import { logAndSaveWeatherAtCoords } from "./weatherLogger";

interface BackfillResult {
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}

/**
 * Backfills weather data for pain entries that have coordinates but missing weather_id
 * Uses the exact coordinates stored in each pain entry
 */
export async function backfillWeatherFromEntryCoordinates(): Promise<BackfillResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No authenticated user");
  }

  // Get pain entries that have coordinates but no weather_id
  const { data: entries, error } = await supabase
    .from('pain_entries')
    .select('id, timestamp_created, latitude, longitude, weather_id')
    .eq('user_id', user.id)
    .is('weather_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('timestamp_created', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch entries: ${error.message}`);
  }

  if (!entries || entries.length === 0) {
    return {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };
  }

  const result: BackfillResult = {
    processed: entries.length,
    successful: 0,
    failed: 0,
    errors: []
  };

  console.log(`🔄 Starting weather backfill for ${entries.length} entries with coordinates`);

  for (const entry of entries) {
    try {
      const weatherId = await logAndSaveWeatherAtCoords(
        entry.timestamp_created,
        entry.latitude!,
        entry.longitude!
      );

      if (weatherId) {
        // Update the entry with the weather_id
        const { error: updateError } = await supabase
          .from('pain_entries')
          .update({ weather_id: weatherId })
          .eq('id', entry.id);

        if (updateError) {
          throw new Error(`Failed to update entry ${entry.id}: ${updateError.message}`);
        }

        result.successful++;
        console.log(`✅ Entry ${entry.id}: weather_id ${weatherId}`);
      } else {
        throw new Error(`No weather data returned for entry ${entry.id}`);
      }

      // Small delay to avoid overwhelming the weather API
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      result.failed++;
      const errorMsg = `Entry ${entry.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
    }
  }

  console.log(`🎉 Weather backfill completed: ${result.successful} successful, ${result.failed} failed`);
  return result;
}