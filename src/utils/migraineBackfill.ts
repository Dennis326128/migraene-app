/**
 * 🔄 WETTER-BACKFILL SYSTEM
 * 
 * Funktionen zum Nachtragen fehlender Wetterdaten für Migräne-Einträge:
 * 
 * 1. backfillMigrainWeatherEntries(days) - Manuell/Automatisch aufrufbar
 * 2. dailyMigraineWeatherBackfill() - Täglicher automatischer Job
 * 
 * Verwendung:
 * - EntriesList.tsx: Button "🌤️ Wetter nachtragen" (manuelle Auslösung)
 * - Index.tsx: Auto-Start beim App-Laden (1x täglich, letzten 7 Tage)
 * - auto-weather-backfill Edge Function: Serverseitiger Cron-Job
 */
import { supabase } from "@/lib/supabaseClient";
import { logAndSaveWeatherAt } from "@/utils/weatherLogger";
import type { MigraineEntry } from "@/types/painApp";

function toAtISO(entry: Pick<MigraineEntry, "selected_date" | "selected_time" | "timestamp_created">): string {
  if (entry.selected_date && entry.selected_time) {
    // Bereinige selected_time: falls bereits Sekunden vorhanden, entferne ":00" am Ende nicht
    let timeStr = entry.selected_time;
    if (timeStr.length === 5) {
      // HH:MM Format → füge Sekunden hinzu
      timeStr += ":00";
    }
    // HH:MM:SS Format bleibt unverändert
    
    const localDateTime = `${entry.selected_date}T${timeStr}`;
    const date = new Date(localDateTime);
    
    // Validiere das Datum
    if (isNaN(date.getTime())) {
      console.warn(`⚠️ Ungültiges Datum für Eintrag: ${entry.selected_date}T${timeStr}, verwende timestamp_created`);
      return new Date(entry.timestamp_created).toISOString();
    }
    
    // Für Europe/Berlin Zeitzone (UTC+1/UTC+2)
    const offset = date.getTimezoneOffset();
    date.setMinutes(date.getMinutes() - offset);
    return date.toISOString();
  }
  return new Date(entry.timestamp_created).toISOString();
}

/** 
 * Verbesserter Backfill für Migräne-Einträge der letzten `days` Tage
 * Mit robuster Fehlerbehandlung und Logging
 */
export async function backfillMigrainWeatherEntries(days = 30): Promise<{
  total: number;
  success: number; 
  failed: number;
  errors: string[];
}> {
  console.log(`🌤️ Starte Wetter-Backfill für die letzten ${days} Tage...`);
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('⚠️ Kein authentifizierter Benutzer gefunden');
    return { total: 0, success: 0, failed: 0, errors: ['Nicht authentifiziert'] };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("pain_entries")
    .select("id, timestamp_created, selected_date, selected_time, weather_id")
    .eq("user_id", user.id)
    .is("weather_id", null)
    .gte("timestamp_created", since.toISOString())
    .order("timestamp_created", { ascending: true });

  if (error) {
    console.error('❌ Fehler beim Laden der Einträge:', error);
    return { total: 0, success: 0, failed: 0, errors: [error.message] };
  }

  if (!data?.length) {
    console.log('✅ Keine Einträge ohne Wetter-Daten gefunden');
    return { total: 0, success: 0, failed: 0, errors: [] };
  }

  console.log(`📊 ${data.length} Einträge ohne Wetter-Daten gefunden`);

  let success = 0, failed = 0;
  const errors: string[] = [];

  for (const entry of data) {
    try {
      const atISO = toAtISO(entry as any);
      console.log(`🔄 Hole Wetter für Eintrag ${entry.id} (${atISO})`);
      
      const weatherId = await logAndSaveWeatherAt(atISO);
      
      if (weatherId) {
        const { error: updateError } = await supabase
          .from("pain_entries")
          .update({ weather_id: weatherId })
          .eq("id", entry.id);
          
        if (updateError) {
          throw new Error(`Update fehlgeschlagen: ${updateError.message}`);
        }
        
        success++;
        console.log(`✅ Wetter-ID ${weatherId} für Eintrag ${entry.id} gespeichert`);
      } else {
        failed++;
        errors.push(`Keine Wetter-Daten für Eintrag ${entry.id} verfügbar`);
        console.warn(`⚠️ Keine Wetter-Daten für Eintrag ${entry.id}`);
      }
      
      // Rate-Limiting: 150ms Pause zwischen Anfragen
      await new Promise(resolve => setTimeout(resolve, 150));
      
    } catch (err) {
      failed++;
      const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      errors.push(`Eintrag ${entry.id}: ${errorMsg}`);
      console.error(`❌ Fehler bei Eintrag ${entry.id}:`, err);
    }
  }

  const result = { total: data.length, success, failed, errors };
  console.log(`🏁 Backfill abgeschlossen:`, result);
  
  return result;
}

/**
 * Täglicher automatischer Backfill-Job (für Cron/Schedule)
 * Läuft täglich um 09:00 Europe/Berlin
 */
export async function dailyMigraineWeatherBackfill(): Promise<void> {
  console.log('🕘 Täglicher Migräne-Wetter-Backfill gestartet...');
  
  try {
    const result = await backfillMigrainWeatherEntries(7); // Letzte 7 Tage
    
    if (result.failed > 0) {
      console.warn(`⚠️ ${result.failed} von ${result.total} Einträgen konnten nicht verarbeitet werden`);
      result.errors.forEach(error => console.warn(`  - ${error}`));
    }
    
    if (result.success > 0) {
      console.log(`✅ ${result.success} Wetter-Einträge erfolgreich nachgetragen`);
    } else {
      console.log('ℹ️ Keine neuen Wetter-Daten erforderlich');
    }
    
  } catch (error) {
    console.error('❌ Kritischer Fehler beim täglichen Backfill:', error);
  }
}