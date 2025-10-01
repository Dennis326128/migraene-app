import React, { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { format, startOfDay, endOfDay, eachDayOfInterval, differenceInDays } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWeatherTimeline } from "@/features/weather/hooks/useWeatherTimeline";
import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import type { MigraineEntry } from "@/types/painApp";

interface Props {
  entries: MigraineEntry[];
  dateRange: { from: string; to: string };
}

interface DailyDataPoint {
  date: string;
  ts: number;
  pain: number | null;
  temperature: number | null;
  pressure: number | null;
  hasEntry: boolean;
}

// Robust pain level normalization for mixed data types
const normalizePainLevel = (level: string | number | undefined | null): number | null => {
  if (level === null || level === undefined) return null;
  
  // If already a number, validate and return
  if (typeof level === 'number') {
    return Math.max(0, Math.min(10, level));
  }
  
  // Convert string to lowercase for mapping
  const levelStr = String(level).toLowerCase().trim();
  
  // Map German pain descriptors to numeric values
  const mapping: Record<string, number> = {
    'keine': 0,
    'leicht': 2,
    'schwach': 2,
    'gering': 2,
    'mittel': 5,
    'moderat': 5,
    'mäßig': 5,
    'stark': 7,
    'heftig': 8,
    'sehr_stark': 9,
    'extrem': 10,
    'unerträglich': 10
  };
  
  // Try direct mapping first
  if (mapping[levelStr] !== undefined) {
    return mapping[levelStr];
  }
  
  // Try to parse as number
  const parsed = parseInt(levelStr);
  if (!isNaN(parsed)) {
    return Math.max(0, Math.min(10, parsed));
  }
  
  // If all else fails, return null
  console.warn('Could not normalize pain level:', level);
  return null;
};

const chartConfig = {
  pain: {
    label: "Schmerz",
    color: "hsl(var(--chart-1))",
  },
  temperature: {
    label: "Temperatur",
    color: "hsl(var(--chart-2))",
  },
  pressure: {
    label: "Luftdruck", 
    color: "hsl(var(--chart-3))",
  },
};

export default function TimeSeriesChart({ entries, dateRange }: Props) {
  const isMobile = useIsMobile();
  
  // Always use today as end date, ignore dateRange.to
  const endDate = useMemo(() => new Date(), []); // Always today
  
  // X-axis should show full selected range
  const startDate = useMemo(() => new Date(dateRange.from), [dateRange.from]);
  
  // Find earliest entry date for data filtering
  const earliestEntryDate = useMemo(() => {
    if (!entries || entries.length === 0) {
      return null;
    }
    
    const entryDates = entries
      .map(entry => {
        const entryDate = entry.selected_date || entry.timestamp_created?.split('T')[0];
        return entryDate ? new Date(entryDate) : null;
      })
      .filter(date => date !== null) as Date[];
    
    if (entryDates.length === 0) {
      return null;
    }
    
    return new Date(Math.min(...entryDates.map(d => d.getTime())));
  }, [entries]);
  
  // Fetch weather data for the range
  const { data: weatherData } = useWeatherTimeline(
    format(startDate, 'yyyy-MM-dd'),
    format(endDate, 'yyyy-MM-dd'),
    true
  );
  
  // Build initial daily data to check for missing weather
  const initialDailyData = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfDay(startDate), end: endOfDay(endDate) });
    const weatherByDate = new Map<string, any>();
    
    // Map weather data with correct field names
    weatherData?.forEach(weather => {
      if (weather.date) {
        weatherByDate.set(weather.date, {
          temp: weather.temperature_c,
          pressure: weather.pressure_mb,
          humidity: weather.humidity
        });
      }
    });
    
    return days.map(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const weather = weatherByDate.get(dateKey);
      return {
        date: dateKey,
        hasWeather: !!(weather?.temp !== null || weather?.pressure !== null)
      };
    });
  }, [weatherData, startDate, endDate]);
  
  // Fallback query for missing weather data - enabled when we have days without weather
  const missingWeatherDays = initialDailyData.filter(day => !day.hasWeather);
  const { data: fallbackWeatherData } = useQuery({
    queryKey: ['fallback-weather', format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];
      
      const { data, error } = await supabase
        .from('weather_logs')
        .select('pressure_mb, temperature_c, humidity, snapshot_date, created_at')
        .eq('user_id', userData.user.id)
        .or(`and(snapshot_date.gte.${format(startDate, 'yyyy-MM-dd')},snapshot_date.lte.${format(endDate, 'yyyy-MM-dd')}),and(snapshot_date.is.null,created_at.gte.${format(startDate, 'yyyy-MM-dd')}T00:00:00,created_at.lte.${format(endDate, 'yyyy-MM-dd')}T23:59:59)`)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      // Group by date, taking the latest entry per day
      const byDate = new Map();
      data?.forEach(weather => {
        // Use snapshot_date if available, otherwise use created_at date
        const date = weather.snapshot_date || weather.created_at?.split('T')[0];
        if (date) {
          const existing = byDate.get(date);
          if (!existing || new Date(weather.created_at) > new Date(existing.created_at)) {
            byDate.set(date, { 
              date,
              temperature_c: weather.temperature_c,
              pressure_mb: weather.pressure_mb,
              humidity: weather.humidity
            });
          }
        }
      });
      
      return Array.from(byDate.values());
    },
    enabled: missingWeatherDays.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  
  // Build daily data series
  const dailyData = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfDay(startDate), end: endOfDay(endDate) });
    
    // Group entries by date
    const entriesByDate = new Map<string, MigraineEntry[]>();
    entries?.forEach(entry => {
      // Use selected_date if available, otherwise timestamp_created
      const entryDate = entry.selected_date || entry.timestamp_created?.split('T')[0];
      if (entryDate) {
        const dateKey = format(new Date(entryDate), 'yyyy-MM-dd');
        if (!entriesByDate.has(dateKey)) {
          entriesByDate.set(dateKey, []);
        }
        entriesByDate.get(dateKey)!.push(entry);
      }
    });
    
    // Build comprehensive weather lookup with proper field mapping
    const weatherByDate = new Map<string, any>();
    
    // Primary weather data from timeline API
    weatherData?.forEach(weather => {
      if (weather.date) {
        weatherByDate.set(weather.date, {
          temp: weather.temperature_c,
          pressure: weather.pressure_mb,
          humidity: weather.humidity
        });
      }
    });
    
    // Add fallback weather data for missing days
    fallbackWeatherData?.forEach(weather => {
      if (weather.date && !weatherByDate.has(weather.date)) {
        weatherByDate.set(weather.date, {
          temp: weather.temperature_c,
          pressure: weather.pressure_mb,
          humidity: weather.humidity
        });
      }
    });
    
    // Create daily data points
    return days.map(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const dayEntries = entriesByDate.get(dateKey) || [];
      const weather = weatherByDate.get(dateKey);
      
      // Calculate max pain level for the day
      let maxPain: number | null = null;
      
      // Only show pain data from earliest entry date onwards
      if (earliestEntryDate && day >= earliestEntryDate) {
        if (dayEntries.length > 0) {
          const painLevels = dayEntries
            .map(entry => normalizePainLevel(entry.pain_level))
            .filter(p => p !== null) as number[];
          
          if (painLevels.length > 0) {
            maxPain = Math.max(...painLevels);
          } else {
            maxPain = 0; // Day with entry but no valid pain data
          }
        } else {
          maxPain = 0; // No entries for this day after earliest entry date
        }
      }
      // Before earliest entry: maxPain stays null
      
      return {
        date: format(day, 'dd.MM'),
        ts: day.getTime(),
        pain: maxPain,
        temperature: weather?.temp ?? null,
        pressure: weather?.pressure ?? null,
        hasEntry: dayEntries.length > 0,
      } as DailyDataPoint;
    });
  }, [entries, weatherData, fallbackWeatherData, startDate, endDate]);
  
  // Calculate optimal tick count for X-axis
  const daysDiff = differenceInDays(endDate, startDate);
  const maxTicks = isMobile ? 4 : Math.min(8, Math.max(4, Math.floor(daysDiff / 7)));
  
  // Generate X-axis ticks
  const xAxisTicks = useMemo(() => {
    if (dailyData.length === 0) return [];
    
    const step = Math.max(1, Math.floor(dailyData.length / maxTicks));
    const ticks: number[] = [];
    
    for (let i = 0; i < dailyData.length; i += step) {
      ticks.push(dailyData[i].ts);
    }
    
    // Always include the last day (today)
    const lastTs = dailyData[dailyData.length - 1]?.ts;
    if (lastTs && !ticks.includes(lastTs)) {
      ticks.push(lastTs);
    }
    
    return ticks;
  }, [dailyData, maxTicks]);
  
  const formatXAxisLabel = (ts: number) => {
    return format(new Date(ts), isMobile ? 'dd.MM' : 'dd.MM.yy');
  };
  
  if (!entries || entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Keine Daten für den gewählten Zeitraum
      </div>
    );
  }
  
  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={dailyData}
          margin={{
            top: 20,
            right: isMobile ? 25 : 40,
            left: isMobile ? 20 : 60,
            bottom: 70,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          
          {/* X-Axis with fixed domain [startDate...today] */}
          <XAxis
            type="number"
            scale="time"
            dataKey="ts"
            domain={[startDate.getTime(), endDate.getTime()]}
            ticks={xAxisTicks}
            tickFormatter={formatXAxisLabel}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            height={60}
          />
          
          {/* Y-Axis for pain (left, fixed 0-10) */}
          <YAxis
            yAxisId="pain"
            domain={[0, 10]}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            label={(props: any) => {
              const { viewBox } = props;
              const x = viewBox.x;
              const y = viewBox.y + viewBox.height + (isMobile ? 25 : 30);
              return (
                <text 
                  x={x} 
                  y={y} 
                  textAnchor="middle" 
                  fontSize={isMobile ? 10 : 12}
                  fill="currentColor"
                  transform={`rotate(-45 ${x} ${y})`}
                >
                  Schmerz
                </text>
              );
            }}
          />
          
          {/* Y-Axis for temperature (right) */}
          <YAxis
            yAxisId="temp"
            orientation="right"
            domain={['dataMin - 2', 'dataMax + 2']}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            width={isMobile ? 40 : 55}
            label={(props: any) => {
              const { viewBox } = props;
              const x = viewBox.x + viewBox.width;
              const y = viewBox.y + viewBox.height + (isMobile ? 25 : 30);
              return (
                <text 
                  x={x} 
                  y={y} 
                  textAnchor="middle" 
                  fontSize={isMobile ? 10 : 12}
                  fill="currentColor"
                  transform={`rotate(-45 ${x} ${y})`}
                >
                  {isMobile ? 'Temp.' : 'Temperatur'}
                </text>
              );
            }}
          />
          
          {/* Y-Axis for pressure (right, offset) */}
          <YAxis
            yAxisId="pressure"
            orientation="right"
            domain={['dataMin - 5', 'dataMax + 5']}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            width={isMobile ? 40 : 55}
            label={(props: any) => {
              const { viewBox } = props;
              const x = viewBox.x + viewBox.width;
              const y = viewBox.y + viewBox.height + (isMobile ? 25 : 30);
              return (
                <text 
                  x={x} 
                  y={y} 
                  textAnchor="middle" 
                  fontSize={isMobile ? 10 : 12}
                  fill="currentColor"
                  transform={`rotate(-45 ${x} ${y})`}
                >
                  {isMobile ? 'Druck' : 'Luftdruck'}
                </text>
              );
            }}
          />
          
          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || !label) return null;
              
              const date = format(new Date(label as number), 'dd.MM.yyyy');
              const validPayload = payload.filter(p => p.value !== null && p.value !== undefined);
              
              if (validPayload.length === 0) return null;
              
              return (
                <ChartTooltipContent
                  active={active}
                  payload={validPayload}
                  label={date}
                  hideLabel={false}
                  className="min-w-32"
                />
              );
            }}
          />
          
          <Legend />
          
          {/* Pain line */}
          <Line
            yAxisId="pain"
            type="monotone"
            dataKey="pain"
            stroke={chartConfig.pain.color}
            strokeWidth={2}
            dot={{ r: 1, fill: chartConfig.pain.color }}
            connectNulls={false}
            isAnimationActive={false}
            name={chartConfig.pain.label}
          />
          
          {/* Temperature line */}
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temperature"
            stroke={chartConfig.temperature.color}
            strokeWidth={2}
            dot={{ r: 1, fill: chartConfig.temperature.color }}
            connectNulls={true}
            isAnimationActive={false}
            name={chartConfig.temperature.label}
          />
          
          {/* Pressure line */}
          <Line
            yAxisId="pressure"
            type="monotone"
            dataKey="pressure"
            stroke={chartConfig.pressure.color}
            strokeWidth={2}
            dot={{ r: 1, fill: chartConfig.pressure.color }}
            connectNulls={true}
            isAnimationActive={false}
            name={chartConfig.pressure.label}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}