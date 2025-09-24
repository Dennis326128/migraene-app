// Manual test script für Wetter-Backfill
// Kann per Developer Tools Console ausgeführt werden

import { triggerDailyBackfill, checkUserCoordinates } from "@/lib/clientWeather";

export const runWeatherBackfillTest = async () => {
  console.log("🧪 Starting Weather Backfill Test...");
  
  try {
    // 1. Check user coordinates
    console.log("📍 Checking user coordinates...");
    const coords = await checkUserCoordinates();
    console.log("Coordinates:", coords);
    
    if (!coords.hasCoordinates) {
      console.warn("⚠️ User has no coordinates set. Please set coordinates in settings first.");
      return {
        status: "incomplete",
        message: "User coordinates missing",
        coordinates: coords
      };
    }
    
    // 2. Trigger daily backfill
    console.log("🌤️ Triggering daily weather backfill...");
    const backfillResult = await triggerDailyBackfill();
    console.log("Backfill result:", backfillResult);
    
    // 3. Test idempotence - run again
    console.log("🔄 Testing idempotence (running backfill again)...");
    const secondResult = await triggerDailyBackfill();
    console.log("Second run result:", secondResult);
    
    const summary = {
      status: "success",
      coordinates: coords,
      firstRun: backfillResult,
      secondRun: secondResult,
      idempotent: secondResult.skip >= backfillResult.ok,
      message: `✅ Test completed. First run: ${backfillResult.ok} ok, ${backfillResult.skip} skip, ${backfillResult.fail} fail. Second run: ${secondResult.ok} ok, ${secondResult.skip} skip, ${secondResult.fail} fail.`
    };
    
    console.log("📊 Test Summary:", summary);
    return summary;
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    return {
      status: "error",
      error: error.message,
      message: `Test failed: ${error.message}`
    };
  }
};

// Export für Dev Console
(window as any).runWeatherBackfillTest = runWeatherBackfillTest;