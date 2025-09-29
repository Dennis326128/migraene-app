import { supabase } from "@/lib/supabaseClient";
import { Geolocation } from '@capacitor/geolocation';

/**
 * Updates user profile coordinates with the latest GPS coordinates from a pain entry
 */
export async function updateUserProfileCoordinates(entryLat?: number, entryLon?: number): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  try {
    let lat = entryLat;
    let lon = entryLon;

    // If no coordinates provided, try to get current GPS position
    if (!lat || !lon) {
      try {
        const position = await Geolocation.getCurrentPosition({ 
          enableHighAccuracy: true, 
          timeout: 10000 
        });
        lat = position.coords.latitude;
        lon = position.coords.longitude;
      } catch (gpsError) {
        console.log('GPS not available for profile update');
        return false;
      }
    }

    if (!lat || !lon) return false;

    // Update user profile with latest coordinates
    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        latitude: lat,
        longitude: lon,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Failed to update user profile coordinates:', error);
      return false;
    }

    console.log(`✅ Updated user profile coordinates: ${lat}, ${lon}`);
    return true;
  } catch (error) {
    console.error('Error updating user profile coordinates:', error);
    return false;
  }
}

/**
 * Gets the best available coordinates for a user (profile fallback)
 */
export async function getUserFallbackCoordinates(): Promise<{ lat: number; lon: number } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('latitude, longitude')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.latitude && profile?.longitude) {
      return { 
        lat: Number(profile.latitude), 
        lon: Number(profile.longitude) 
      };
    }

    // Fallback: get coordinates from latest pain entry
    const { data: lastEntry } = await supabase
      .from('pain_entries')
      .select('latitude, longitude')
      .eq('user_id', user.id)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('timestamp_created', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastEntry?.latitude && lastEntry?.longitude) {
      // Update profile with these coordinates for future use
      await updateUserProfileCoordinates(Number(lastEntry.latitude), Number(lastEntry.longitude));
      return { 
        lat: Number(lastEntry.latitude), 
        lon: Number(lastEntry.longitude) 
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting user fallback coordinates:', error);
    return null;
  }
}