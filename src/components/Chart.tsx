import React, { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { useWeatherTimeline } from "@/features/weather/hooks/useWeatherTimeline";
import { useIsMobile } from "@/hooks/use-mobile";
import { MigraineEntry } from "@/types/painApp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

// Helper function to format date for chart labels
const formatDateLabel = (dateStr: string, timeRange: string): string => {
  const date = new Date(dateStr);
  
  // For timeRanges longer than 1 month, show only date
  if (timeRange === "3m" || timeRange === "6m" || timeRange === "1y") {
    return date.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit' 
    });
  }
  
  // For shorter timeRanges, show date and time
  return date.toLocaleDateString('de-DE', { 
    day: '2-digit', 
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function ChartComponent({ entries, dateRange }: Props) {
  const isMobile = useIsMobile();
  const [showPassiveWeather, setShowPassiveWeather] = useState(true);

  // Determine time range for label formatting
  const timeRangeType = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return "alle";
    
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    const diffDays = Math.abs((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24));
    
    if (diffDays <= 7) return "7d";
    if (diffDays <= 30) return "30d";
    if (diffDays <= 90) return "3m";
    if (diffDays <= 180) return "6m";
    if (diffDays <= 365) return "1y";
    return "alle";
  }, [dateRange]);

  // Filter entries based on dateRange
  const filteredEntries = useMemo(() => {
    if (!dateRange?.from && !dateRange?.to) {
      return entries || [];
    }
    
    return (entries || []).filter(entry => {
      const entryDate = entry.selected_date || new Date(entry.timestamp_created).toISOString().split('T')[0];
      
      if (dateRange.from && entryDate < dateRange.from) return false;
      if (dateRange.to && entryDate > dateRange.to) return false;
      
      return true;
    });
  }, [entries, dateRange]);

  console.log('📊 Chart data processing:', {
    originalCount: entries?.length || 0,
    filteredCount: filteredEntries.length,
    dateRange,
    timeRangeType,
    sampleEntry: filteredEntries[0]
  });

  // Get weather timeline data for the filtered date range
  const { data: weatherTimeline = [] } = useWeatherTimeline(
    dateRange?.from,
    dateRange?.to,
    showPassiveWeather
  );

  // Process chart data
  const chartData = useMemo(() => {
    if (!filteredEntries.length) return [];

    // Sort entries chronologically (oldest to newest for left-to-right display)
    const sortedEntries = [...filteredEntries].sort((a, b) => {
      const aTime = new Date(a.selected_date ? 
        `${a.selected_date}T${a.selected_time || '12:00'}` : 
        a.timestamp_created
      ).getTime();
      const bTime = new Date(b.selected_date ? 
        `${b.selected_date}T${b.selected_time || '12:00'}` : 
        b.timestamp_created
      ).getTime();
      return aTime - bTime;
    });

    // Create a map of weather data by date for quick lookup
    const weatherMap = new Map();
    weatherTimeline.forEach(weather => {
      const dateKey = weather.date;
      if (dateKey) {
        weatherMap.set(dateKey, weather);
      }
    });

    // Process entries into chart data points
    const data = sortedEntries.map(entry => {
      const entryDate = entry.selected_date || new Date(entry.timestamp_created).toISOString().split('T')[0];
      const entryTime = entry.selected_time || new Date(entry.timestamp_created).toTimeString().slice(0, 5);
      const entryDateTime = `${entryDate}T${entryTime}`;
      
      // Get weather data for this entry's date
      const weather = weatherMap.get(entryDate) || entry.weather;
      
      return {
        date: entryDateTime,
        label: formatDateLabel(entryDateTime, timeRangeType),
        pain: painLevelToScore(entry.pain_level),
        painLevel: entry.pain_level,
        pressure: weather?.pressure_mb || null,
        temperature: weather?.temperature_c || null,
        aura: entry.aura_type,
        location: entry.pain_location,
        medications: entry.medications?.length || 0,
        hasWeather: !!weather,
        notes: entry.notes
      };
    });

    console.log('📊 Processed chart data:', {
      dataPoints: data.length,
      withWeather: data.filter(d => d.hasWeather).length,
      dateRange: data.length > 0 ? {
        first: data[0].label,
        last: data[data.length - 1].label
      } : null
    });

    return data;
  }, [filteredEntries, weatherTimeline, timeRangeType]);

  // Calculate weather correlation
  const weatherCorrelation = useMemo(() => {
    const dataWithWeather = chartData.filter(d => d.pressure != null);
    if (dataWithWeather.length < 3) return null;

    const avgPainByPressure = {
      low: { pain: 0, count: 0 },
      normal: { pain: 0, count: 0 },
      high: { pain: 0, count: 0 }
    };

    dataWithWeather.forEach(d => {
      if (d.pressure! < 1005) {
        avgPainByPressure.low.pain += d.pain;
        avgPainByPressure.low.count++;
      } else if (d.pressure! > 1020) {
        avgPainByPressure.high.pain += d.pain;
        avgPainByPressure.high.count++;
      } else {
        avgPainByPressure.normal.pain += d.pain;
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

  // Show empty state if no data
  if (!chartData.length) {
    const hasDateRange = dateRange?.from || dateRange?.to;
    const totalEntries = entries?.length || 0;
    
    return (
      <div className="text-center py-8 text-muted-foreground">
        <div className="text-lg mb-2">📈</div>
        {hasDateRange ? (
          <div className="space-y-2">
            <div className="text-sm">Keine Daten im gewählten Zeitraum</div>
            {totalEntries > 0 && (
              <div className="text-xs">
                {totalEntries} Einträge insgesamt vorhanden - wählen Sie einen anderen Zeitraum
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm">Keine Daten für die Grafik</div>
        )}
      </div>
    );
  }

  // Calculate data quality metrics
  const dataQuality = useMemo(() => {
    const withWeather = chartData.filter(d => d.hasWeather).length;
    const weatherPercentage = chartData.length > 0 ? Math.round((withWeather / chartData.length) * 100) : 0;
    
    return {
      total: chartData.length,
      withWeather,
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
            {chartData.length} Einträge
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
                return (
                  <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
                    <p className="font-medium">{label}</p>
                    <p className="text-sm">
                      <span className="text-blue-500">●</span> Schmerz: {data.pain}/10 ({data.painLevel})
                    </p>
                    {data.aura && <p className="text-xs">Aura: {data.aura}</p>}
                    {data.location && <p className="text-xs">Ort: {data.location}</p>}
                    {data.medications > 0 && <p className="text-xs">Medikamente: {data.medications}</p>}
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