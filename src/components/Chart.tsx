import React, { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { useWeatherTimeline } from "@/features/weather/hooks/useWeatherTimeline";
import { useIsMobile } from "@/hooks/use-mobile";
import { MigraineEntry } from "@/types/painApp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { addDays, format, parseISO, startOfDay, endOfDay, differenceInDays, isSameDay } from "date-fns";

interface Props {
  entries: MigraineEntry[];
  dateRange?: {
    from?: string;
    to?: string;
  };
}

// Helper function to convert pain level to numeric score
const painLevelToScore = (level: string): number => {
  switch (level) {
    case "leicht": return 2;
    case "mittel": return 5;
    case "stark": return 7;
    case "sehr_stark": return 9;
    default: return 0;
  }
};

// Generate continuous time axis from start to end date
function generateTimeAxis(fromDate: string, toDate: string) {
  const start = startOfDay(parseISO(fromDate));
  const end = endOfDay(parseISO(toDate));
  const daysDiff = differenceInDays(end, start);
  
  const timePoints = [];
  let current = start;
  
  while (current <= end) {
    const dateStr = format(current, 'yyyy-MM-dd');
    timePoints.push({
      date: dateStr,
      displayDate: current,
      pain_level: null,
      atmospheric_pressure: null,
      temperature: null,
      humidity: null,
      label: formatXAxisLabel(current, daysDiff)
    });
    current = addDays(current, 1);
  }
  
  return { timePoints, daysDiff };
}

// Format X-axis labels based on time range
function formatXAxisLabel(date: Date, daysDiff: number): string {
  if (daysDiff <= 1) {
    // Today/Yesterday: Show time
    return format(date, 'HH:mm');
  } else if (daysDiff <= 7) {
    // Week: Show day and date
    return format(date, 'EEE dd.MM');
  } else if (daysDiff <= 31) {
    // Month: Show date
    return format(date, 'dd.MM');
  } else {
    // Longer: Show month/year
    return format(date, 'MM.yy');
  }
}

export default function ChartComponent({ entries, dateRange }: Props) {
  const isMobile = useIsMobile();
  const [showPassiveWeather, setShowPassiveWeather] = useState(true);

  // Determine the actual date range - default to showing last 30 days if no range provided
  const actualDateRange = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return { from: dateRange.from, to: dateRange.to };
    }
    
    // Default to last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    return {
      from: format(thirtyDaysAgo, 'yyyy-MM-dd'),
      to: format(today, 'yyyy-MM-dd')
    };
  }, [dateRange]);

  console.log('📊 Chart date range:', {
    requested: dateRange,
    actual: actualDateRange,
    totalEntries: entries?.length || 0
  });

  // Get weather timeline data for the actual date range
  const { data: weatherTimeline = [] } = useWeatherTimeline(
    actualDateRange.from,
    actualDateRange.to,
    showPassiveWeather
  );

  // Process chart data with continuous time axis
  const chartData = useMemo(() => {
    // Generate continuous time axis for the date range
    const { timePoints, daysDiff } = generateTimeAxis(actualDateRange.from, actualDateRange.to);
    
    // Create a map of entries by date for quick lookup
    const entriesMap = new Map<string, MigraineEntry[]>();
    (entries || []).forEach(entry => {
      const entryDate = entry.selected_date || new Date(entry.timestamp_created).toISOString().split('T')[0];
      
      // Only include entries within the date range
      if (entryDate >= actualDateRange.from && entryDate <= actualDateRange.to) {
        if (!entriesMap.has(entryDate)) {
          entriesMap.set(entryDate, []);
        }
        entriesMap.get(entryDate)!.push(entry);
      }
    });

    // Create a map of weather data by date for quick lookup
    const weatherMap = new Map();
    weatherTimeline.forEach(weather => {
      const dateKey = weather.date;
      if (dateKey) {
        weatherMap.set(dateKey, weather);
      }
    });

    // Map each time point to chart data
    const data = timePoints.map(timePoint => {
      const entriesForDate = entriesMap.get(timePoint.date) || [];
      
      // For days with entries, use the most recent entry (or average if multiple)
      let painValue = null;
      let painLevel = null;
      let aura = null;
      let location = null;
      let medications = 0;
      let notes = null;
      
      if (entriesForDate.length > 0) {
        // Sort by time if available, otherwise use creation time
        const sortedEntries = entriesForDate.sort((a, b) => {
          const aTime = a.selected_time || new Date(a.timestamp_created).toTimeString().slice(0, 5);
          const bTime = b.selected_time || new Date(b.timestamp_created).toTimeString().slice(0, 5);
          return bTime.localeCompare(aTime); // Latest first
        });
        
        const latestEntry = sortedEntries[0];
        painValue = painLevelToScore(latestEntry.pain_level);
        painLevel = latestEntry.pain_level;
        aura = latestEntry.aura_type;
        location = latestEntry.pain_location;
        medications = latestEntry.medications?.length || 0;
        notes = latestEntry.notes;
      }
      
      // Get weather data for this date
      const weather = weatherMap.get(timePoint.date);
      
      return {
        date: timePoint.date,
        label: timePoint.label,
        pain: painValue,
        painLevel: painLevel,
        pressure: weather?.pressure_mb || null,
        temperature: weather?.temperature_c || null,
        aura,
        location,
        medications,
        hasWeather: !!weather,
        notes,
        entriesCount: entriesForDate.length
      };
    });

    console.log('📊 Continuous chart data:', {
      timePointsGenerated: timePoints.length,
      daysWithEntries: data.filter(d => d.pain !== null).length,
      daysWithWeather: data.filter(d => d.hasWeather).length,
      dateRange: { from: actualDateRange.from, to: actualDateRange.to, days: daysDiff }
    });

    return data;
  }, [entries, actualDateRange, weatherTimeline]);

  // Calculate weather correlation
  const weatherCorrelation = useMemo(() => {
    const dataWithPainAndWeather = chartData.filter(d => d.pain !== null && d.pressure != null);
    if (dataWithPainAndWeather.length < 3) return null;

    const avgPainByPressure = {
      low: { pain: 0, count: 0 },
      normal: { pain: 0, count: 0 },
      high: { pain: 0, count: 0 }
    };

    dataWithPainAndWeather.forEach(d => {
      if (d.pressure! < 1005) {
        avgPainByPressure.low.pain += d.pain!;
        avgPainByPressure.low.count++;
      } else if (d.pressure! > 1020) {
        avgPainByPressure.high.pain += d.pain!;
        avgPainByPressure.high.count++;
      } else {
        avgPainByPressure.normal.pain += d.pain!;
        avgPainByPressure.normal.count++;
      }
    });

    // Calculate averages
    Object.keys(avgPainByPressure).forEach(key => {
      const category = avgPainByPressure[key as keyof typeof avgPainByPressure];
      category.pain = category.count > 0 ? category.pain / category.count : 0;
    });

    return avgPainByPressure;
  }, [chartData]);

  // Show empty state if no entries in the time range
  const entriesInRange = chartData.filter(d => d.pain !== null);
  if (entriesInRange.length === 0) {
    const totalEntries = entries?.length || 0;
    
    return (
      <div className="text-center py-8 text-muted-foreground">
        <div className="text-lg mb-2">📈</div>
        <div className="space-y-2">
          <div className="text-sm">Keine Einträge im Zeitraum</div>
          <div className="text-xs">
            {format(parseISO(actualDateRange.from), 'dd.MM.yyyy')} - {format(parseISO(actualDateRange.to), 'dd.MM.yyyy')}
          </div>
          {totalEntries > 0 && (
            <div className="text-xs">
              {totalEntries} Einträge insgesamt vorhanden - wählen Sie einen anderen Zeitraum
            </div>
          )}
        </div>
      </div>
    );
  }

  // Calculate data quality metrics
  const dataQuality = useMemo(() => {
    const entriesWithData = chartData.filter(d => d.pain !== null);
    const entriesWithWeather = chartData.filter(d => d.pain !== null && d.hasWeather);
    const weatherPercentage = entriesWithData.length > 0 ? Math.round((entriesWithWeather.length / entriesWithData.length) * 100) : 0;
    
    return {
      totalDays: chartData.length,
      daysWithEntries: entriesWithData.length,
      daysWithWeather: entriesWithWeather.length,
      weatherPercentage
    };
  }, [chartData]);

  const hasWeatherData = chartData.some(d => d.pressure != null);

  return (
    <div className="space-y-4">
      {/* Data Quality & Weather Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant="outline">
            {dataQuality.daysWithEntries} Einträge in {dataQuality.totalDays} Tagen
          </Badge>
          {hasWeatherData && (
            <Badge variant="outline">
              {dataQuality.weatherPercentage}% mit Wetter
            </Badge>
          )}
        </div>
        
        {hasWeatherData && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPassiveWeather(!showPassiveWeather)}
            className="text-xs"
          >
            {showPassiveWeather ? "Nur aktive Wetterdaten" : "Auch passive Wetterdaten"}
          </Button>
        )}
      </div>

      {/* Weather Correlation Summary */}
      {weatherCorrelation && (
        <div className="bg-muted/50 p-3 rounded-lg text-sm">
          <div className="font-medium mb-2">Wetterkorrelation (Luftdruck):</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>Tiefdruck (&lt;1005mb): Ø {weatherCorrelation.low.pain.toFixed(1)}/10 ({weatherCorrelation.low.count}x)</div>
            <div>Normal (1005-1020mb): Ø {weatherCorrelation.normal.pain.toFixed(1)}/10 ({weatherCorrelation.normal.count}x)</div>
            <div>Hochdruck (&gt;1020mb): Ø {weatherCorrelation.high.pain.toFixed(1)}/10 ({weatherCorrelation.high.count}x)</div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 5,
              right: isMobile ? 10 : 30,
              left: isMobile ? 10 : 20,
              bottom: isMobile ? 20 : 5,
            }}
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: isMobile ? 10 : 12 }}
              angle={isMobile ? -45 : 0}
              textAnchor={isMobile ? "end" : "middle"}
              height={isMobile ? 60 : 30}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="pain"
              orientation="left"
              domain={[0, 10]}
              tick={{ fontSize: isMobile ? 10 : 12 }}
              label={!isMobile ? { value: 'Schmerzstärke', angle: -90, position: 'insideLeft' } : undefined}
            />
            {hasWeatherData && (
              <YAxis
                yAxisId="pressure"
                orientation="right"
                domain={['dataMin - 5', 'dataMax + 5']}
                tick={{ fontSize: isMobile ? 10 : 12 }}
                label={!isMobile ? { value: 'Luftdruck (mb)', angle: 90, position: 'insideRight' } : undefined}
              />
            )}
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0].payload;
                
                // Don't show tooltip for empty data points
                if (data.pain === null && data.pressure === null) return null;
                
                return (
                  <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
                    <p className="font-medium">{label}</p>
                    {data.pain !== null ? (
                      <p className="text-sm">
                        <span className="text-blue-500">●</span> Schmerz: {data.pain}/10 ({data.painLevel})
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Kein Eintrag an diesem Tag</p>
                    )}
                    {data.aura && <p className="text-xs">Aura: {data.aura}</p>}
                    {data.location && <p className="text-xs">Ort: {data.location}</p>}
                    {data.medications > 0 && <p className="text-xs">Medikamente: {data.medications}</p>}
                    {data.entriesCount > 1 && <p className="text-xs">{data.entriesCount} Einträge an diesem Tag</p>}
                    {data.pressure && (
                      <p className="text-sm">
                        <span className="text-orange-500">●</span> Luftdruck: {data.pressure}mb
                      </p>
                    )}
                    {data.temperature && <p className="text-xs">Temperatur: {data.temperature}°C</p>}
                    {data.notes && <p className="text-xs mt-1 italic">"{data.notes}"</p>}
                  </div>
                );
              }}
            />
            <Legend />
            
            {/* Pain Level Line */}
            <Line
              yAxisId="pain"
              type="monotone"
              dataKey="pain"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 4, fill: "hsl(var(--primary))" }}
              connectNulls={false}
              name="Schmerzstärke"
            />
            
            {/* Pressure Line */}
            {hasWeatherData && (
              <Line
                yAxisId="pressure"
                type="monotone"
                dataKey="pressure"
                stroke="hsl(var(--destructive))"
                strokeWidth={1}
                dot={{ r: 2, fill: "hsl(var(--destructive))" }}
                connectNulls={false}
                name="Luftdruck (mb)"
                strokeDasharray="3 3"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}