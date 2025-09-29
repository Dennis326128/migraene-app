import React, { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { format, startOfDay, endOfDay, eachDayOfInterval, differenceInDays } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWeatherTimeline } from "@/features/weather/hooks/useWeatherTimeline";
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
    label: "Schmerzlevel",
    color: "hsl(var(--chart-1))",
  },
  temperature: {
    label: "Temperatur (°C)",
    color: "hsl(var(--chart-2))",
  },
  pressure: {
    label: "Luftdruck (hPa)",
    color: "hsl(var(--chart-3))",
  },
};

export default function TimeSeriesChart({ entries, dateRange }: Props) {
  const isMobile = useIsMobile();
  
  // Always use today as end date, ignore dateRange.to
  const startDate = useMemo(() => new Date(dateRange.from), [dateRange.from]);
  const endDate = useMemo(() => new Date(), []); // Always today
  
  // Fetch weather data for the range
  const { data: weatherData } = useWeatherTimeline(
    format(startDate, 'yyyy-MM-dd'),
    format(endDate, 'yyyy-MM-dd'),
    true
  );
  
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
    
    // Group weather by date
    const weatherByDate = new Map<string, any>();
    weatherData?.forEach(weather => {
      if (weather.date) {
        weatherByDate.set(weather.date, weather);
      }
    });
    
    // Create daily data points
    return days.map(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const dayEntries = entriesByDate.get(dateKey) || [];
      const weather = weatherByDate.get(dateKey);
      
      // Calculate max pain level for the day
      let maxPain: number | null = null;
      if (dayEntries.length > 0) {
        const painLevels = dayEntries
          .map(entry => normalizePainLevel(entry.pain_level))
          .filter(p => p !== null) as number[];
        
        if (painLevels.length > 0) {
          maxPain = Math.max(...painLevels);
        }
      }
      
      return {
        date: format(day, 'dd.MM'),
        ts: day.getTime(),
        pain: maxPain,
        temperature: weather?.temperature_c ?? null,
        pressure: weather?.pressure_mb ?? null,
        hasEntry: dayEntries.length > 0,
      } as DailyDataPoint;
    });
  }, [entries, weatherData, startDate, endDate]);
  
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
            right: isMobile ? 20 : 60,
            left: isMobile ? 20 : 60,
            bottom: 60,
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
            label={{ 
              value: 'Schmerz', 
              angle: -90, 
              position: 'insideLeft',
              style: { textAnchor: 'middle', fontSize: isMobile ? 10 : 12 }
            }}
          />
          
          {/* Y-Axis for temperature (right) */}
          <YAxis
            yAxisId="temp"
            orientation="right"
            tick={{ fontSize: isMobile ? 10 : 12 }}
            label={{ 
              value: 'Temp (°C)', 
              angle: 90, 
              position: 'insideRight',
              style: { textAnchor: 'middle', fontSize: isMobile ? 10 : 12 }
            }}
          />
          
          {/* Y-Axis for pressure (right, offset) */}
          <YAxis
            yAxisId="pressure"
            orientation="right"
            tick={false}
            width={0}
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
            dot={{ r: 4, strokeWidth: 2 }}
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
            dot={{ r: 3, strokeWidth: 1 }}
            connectNulls={false}
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
            dot={{ r: 3, strokeWidth: 1 }}
            connectNulls={false}
            isAnimationActive={false}
            name={chartConfig.pressure.label}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}