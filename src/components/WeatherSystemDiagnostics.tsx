import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { testWeatherSystems } from '@/utils/weatherSystemTest';
import { triggerAutoBackfill, triggerDailyBackfill, checkUserCoordinates } from '@/lib/clientWeather';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

interface DiagnosticResult {
  coordinateTest: any;
  dailyBackfillTest: any;
  autoBackfillTest: any;
  edgeFunctionTest?: any;
  databaseTest?: any;
}

interface WeatherEntry {
  id: number;
  weather_id: number | null;
  timestamp_created: string;
  latitude?: number;
  longitude?: number;
}

export function WeatherSystemDiagnostics() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult | null>(null);
  const [weatherEntries, setWeatherEntries] = useState<WeatherEntry[]>([]);

  const runFullDiagnostics = async () => {
    setIsRunning(true);
    setResults(null);
    
    try {
      console.log('🔍 Starting comprehensive weather diagnostics...');
      
      // 1. Test coordinate system
      console.log('📍 Testing coordinate system...');
      const coordinates = await checkUserCoordinates();
      
      // 2. Test database connectivity and recent entries
      console.log('💾 Testing database connectivity...');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get recent entries without weather
      const { data: entries, error: entriesError } = await supabase
        .from('pain_entries')
        .select('id, weather_id, timestamp_created, latitude, longitude')
        .eq('user_id', user.id)
        .order('timestamp_created', { ascending: false })
        .limit(10);

      if (entriesError) {
        throw new Error(`Database error: ${entriesError.message}`);
      }

      setWeatherEntries(entries || []);

      // 3. Test edge functions
      console.log('🌤️ Testing edge functions...');
      let edgeFunctionTest;
      try {
        const { data: hybridResult, error: hybridError } = await supabase.functions.invoke('fetch-weather-hybrid', {
          body: {
            lat: coordinates.latitude || 50.935,
            lon: coordinates.longitude || 6.962,
            at: new Date().toISOString()
          }
        });

        if (hybridError) {
          throw new Error(`Hybrid function error: ${hybridError.message}`);
        }

        edgeFunctionTest = {
          success: true,
          hybridResult,
          message: 'Edge functions operational'
        };
      } catch (error: any) {
        edgeFunctionTest = {
          success: false,
          error: error.message,
          message: 'Edge function test failed'
        };
      }

      // 4. Run the full weather system tests
      console.log('🧪 Running weather system tests...');
      const systemTests = await testWeatherSystems();
      
      // 5. Test daily backfill
      console.log('📅 Testing daily backfill...');
      const dailyTest = await triggerDailyBackfill();
      
      // 6. Test auto backfill
      console.log('🔄 Testing auto backfill...');
      const autoTest = await triggerAutoBackfill();

      const finalResults = {
        coordinateTest: {
          success: coordinates.hasCoordinates,
          coordinates: coordinates,
          message: coordinates.hasCoordinates ? 'Coordinates available' : 'No fallback coordinates'
        },
        dailyBackfillTest: dailyTest,
        autoBackfillTest: autoTest,
        edgeFunctionTest,
        databaseTest: {
          success: true,
          entriesCount: entries?.length || 0,
          entriesWithoutWeather: entries?.filter(e => !e.weather_id).length || 0,
          message: `Found ${entries?.length || 0} recent entries`
        }
      };

      setResults(finalResults);
      
      toast.success('Weather diagnostics completed');
      console.log('✅ Diagnostics completed:', finalResults);

    } catch (error: any) {
      console.error('❌ Diagnostics failed:', error);
      toast.error(`Diagnostics failed: ${error.message}`);
      
      setResults({
        coordinateTest: { success: false, error: error.message },
        dailyBackfillTest: { success: false, error: error.message },
        autoBackfillTest: { success: false, error: error.message }
      });
    } finally {
      setIsRunning(false);
    }
  };

  const fixMissingWeather = async () => {
    try {
      toast.info('Starting weather import...');
      
      const { data, error } = await supabase.functions.invoke('clean-weather-import', {
        method: 'POST'
      });

      if (error) throw error;
      
      toast.success(`Weather import completed: ${data.successCount} successful, ${data.failCount} failed`);
      
      // Refresh entries
      runFullDiagnostics();
      
    } catch (error: any) {
      console.error('Weather import error:', error);
      toast.error(`Weather import failed: ${error.message}`);
    }
  };

  const renderStatus = (success: boolean, message?: string) => (
    <Badge variant={success ? "default" : "destructive"}>
      {success ? '✅' : '❌'} {message || (success ? 'OK' : 'FAIL')}
    </Badge>
  );

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🔧 Weather System Diagnostics
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <Button 
            onClick={runFullDiagnostics} 
            disabled={isRunning}
            variant="outline"
          >
            {isRunning ? '🔄 Running...' : '🧪 Run Full Diagnostics'}
          </Button>
          
          <Button 
            onClick={fixMissingWeather}
            variant="secondary"
            disabled={isRunning}
          >
            🔧 Fix Missing Weather Data
          </Button>
        </div>

        {results && (
          <div className="space-y-4">
            <Separator />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">📍 Coordinate System</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderStatus(results.coordinateTest.success, results.coordinateTest.message)}
                  {results.coordinateTest.coordinates && (
                    <div className="text-xs mt-2 text-muted-foreground">
                      Lat: {results.coordinateTest.coordinates.latitude?.toFixed(4)}<br/>
                      Lon: {results.coordinateTest.coordinates.longitude?.toFixed(4)}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">🌤️ Edge Functions</CardTitle>
                </CardHeader>
                <CardContent>
                  {results.edgeFunctionTest && renderStatus(
                    results.edgeFunctionTest.success, 
                    results.edgeFunctionTest.message
                  )}
                  {results.edgeFunctionTest?.hybridResult?.weather_id && (
                    <div className="text-xs mt-2 text-muted-foreground">
                      Weather ID: {results.edgeFunctionTest.hybridResult.weather_id}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">📅 Daily Backfill</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderStatus(results.dailyBackfillTest.success)}
                  <div className="text-xs mt-2 text-muted-foreground">
                    OK: {results.dailyBackfillTest.ok || 0}<br/>
                    Skip: {results.dailyBackfillTest.skip || 0}<br/>
                    Fail: {results.dailyBackfillTest.fail || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">🔄 Auto Backfill</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderStatus(results.autoBackfillTest.success)}
                  <div className="text-xs mt-2 text-muted-foreground">
                    Processed: {results.autoBackfillTest.totalProcessed || 0}<br/>
                    Success: {results.autoBackfillTest.successCount || 0}<br/>
                    Failed: {results.autoBackfillTest.failCount || 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            {results.databaseTest && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">💾 Database Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderStatus(results.databaseTest.success, results.databaseTest.message)}
                  <div className="text-xs mt-2 text-muted-foreground">
                    Entries without weather: {results.databaseTest.entriesWithoutWeather}
                  </div>
                </CardContent>
              </Card>
            )}

            {weatherEntries.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">📋 Recent Entries</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {weatherEntries.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="flex justify-between items-center text-xs">
                        <span>Entry #{entry.id}</span>
                        <div className="flex items-center gap-2">
                          {entry.weather_id ? (
                            <Badge variant="outline" className="text-xs">
                              ✅ Weather #{entry.weather_id}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              ❌ No Weather
                            </Badge>
                          )}
                          {entry.latitude && entry.longitude && (
                            <Badge variant="secondary" className="text-xs">
                              📍 GPS
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}