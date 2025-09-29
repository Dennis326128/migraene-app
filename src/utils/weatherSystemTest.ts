import { triggerAutoBackfill, triggerDailyBackfill } from "@/lib/clientWeather";

export async function testWeatherSystems(): Promise<{
  coordinateTest: any;
  dailyBackfillTest: any;
  autoBackfillTest: any;
}> {
  try {
    console.log('🧪 Testing weather systems...');

    // Test 1: Coordinate system
    console.log('📍 Testing coordinate system...');
    const { getUserFallbackCoordinates } = await import('@/utils/coordinateUpdater');
    const coordinates = await getUserFallbackCoordinates();
    const coordinateTest = {
      success: !!coordinates,
      coordinates,
      message: coordinates ? 'Fallback coordinates available' : 'No fallback coordinates found'
    };

    // Test 2: Daily backfill
    console.log('🌤️ Testing daily backfill...');
    const dailyBackfillTest = await triggerDailyBackfill();

    // Test 3: Auto backfill 
    console.log('🔄 Testing auto backfill...');
    const autoBackfillTest = await triggerAutoBackfill();

    const result = {
      coordinateTest,
      dailyBackfillTest,
      autoBackfillTest
    };

    console.log('📊 Weather systems test results:', result);
    return result;

  } catch (error) {
    console.error('❌ Weather systems test failed:', error);
    throw error;
  }
}

// Export for Dev Console
(window as any).testWeatherSystems = testWeatherSystems;