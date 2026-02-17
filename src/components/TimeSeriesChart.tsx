import React, { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { format, differenceInDays } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWeatherTimeline } from "@/features/weather/hooks/useWeatherTimeline";
import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import type { MigraineEntry } from "@/types/painApp";
import {
  buildPainWeatherSeries,
  PAIN_WEATHER_CHART_CONFIG,
  computeXAxisTicks,
  type PainWeatherDataPoint,
} from "@/lib/charts/painWeatherData";

interface Props {
  entries: MigraineEntry[];
  dateRange: { from: string; to: string };
}

// Recharts-compatible config (uses CSS variables)
const chartConfig = {
  pain: { label: PAIN_WEATHER_CHART_CONFIG.pain.label, color: PAIN_WEATHER_CHART_CONFIG.pain.color },
  temperature: { label: PAIN_WEATHER_CHART_CONFIG.temperature.label, color: PAIN_WEATHER_CHART_CONFIG.temperature.color },
  pressure: { label: PAIN_WEATHER_CHART_CONFIG.pressure.label, color: PAIN_WEATHER_CHART_CONFIG.pressure.color },
};

const TimeSeriesChart = React.memo(function TimeSeriesChart({ entries, dateRange }: Props) {
  const isMobile = useIsMobile();
  
  // Always use today as end date
  const endDate = useMemo(() => new Date(), []);
  const startDate = useMemo(() => new Date(dateRange.from), [dateRange.from]);
  
  // Find earliest entry date
  const earliestEntryDate = useMemo(() => {
    if (!entries || entries.length === 0) return null;
    const entryDates = entries
      .map(entry => {
        const entryDate = entry.selected_date || entry.timestamp_created?.split('T')[0];
        return entryDate ? new Date(entryDate) : null;
      })
      .filter((date): date is Date => date !== null);
    if (entryDates.length === 0) return null;
    return new Date(Math.min(...entryDates.map(d => d.getTime())));
  }, [entries]);
  
  // Fetch weather data
  const { data: weatherData } = useWeatherTimeline(
    format(startDate, 'yyyy-MM-dd'),
    format(endDate, 'yyyy-MM-dd'),
    true
  );
  
  // Check for missing weather days
  const initialWeatherCheck = useMemo(() => {
    const weatherByDate = new Map<string, boolean>();
    weatherData?.forEach(weather => {
      if (weather.date) {
        const hasData = weather.temperature_c !== null || weather.pressure_mb !== null;
        weatherByDate.set(weather.date, hasData);
      }
    });
    return weatherByDate;
  }, [weatherData]);
  
  // Fallback weather query for missing days
  const hasMissingWeather = useMemo(() => {
    if (!weatherData) return false;
    const days = differenceInDays(endDate, startDate);
    return weatherData.length < days * 0.5; // If less than 50% coverage
  }, [weatherData, startDate, endDate]);

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
      const byDate = new Map();
      data?.forEach(weather => {
        const date = weather.snapshot_date || weather.created_at?.split('T')[0];
        if (date) {
          const existing = byDate.get(date);
          if (!existing || new Date(weather.created_at) > new Date(existing.created_at)) {
            byDate.set(date, { date, temperature_c: weather.temperature_c, pressure_mb: weather.pressure_mb });
          }
        }
      });
      return Array.from(byDate.values());
    },
    enabled: hasMissingWeather,
    staleTime: 5 * 60 * 1000,
  });
  
  // Build weather lookup and use SHARED data builder
  const dailyData = useMemo(() => {
    const weatherByDate = new Map<string, { temp: number | null; pressure: number | null }>();
    
    weatherData?.forEach(weather => {
      if (weather.date) {
        weatherByDate.set(weather.date, {
          temp: weather.temperature_c,
          pressure: weather.pressure_mb,
        });
      }
    });
    
    fallbackWeatherData?.forEach(weather => {
      if (weather.date && !weatherByDate.has(weather.date)) {
        weatherByDate.set(weather.date, {
          temp: weather.temperature_c,
          pressure: weather.pressure_mb,
        });
      }
    });
    
    return buildPainWeatherSeries({
      entries,
      weatherByDate,
      from: startDate,
      to: endDate,
      earliestEntryDate,
    });
  }, [entries, weatherData, fallbackWeatherData, startDate, endDate, earliestEntryDate]);
  
  // X-axis ticks
  const daysDiff = differenceInDays(endDate, startDate);
  const maxTicks = isMobile ? 4 : Math.min(8, Math.max(4, Math.floor(daysDiff / 7)));
  const xAxisTicks = useMemo(() => computeXAxisTicks(dailyData, maxTicks), [dailyData, maxTicks]);
  
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
          
          <YAxis
            yAxisId="pain"
            domain={[0, 10]}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            label={(props: any) => {
              const { viewBox } = props;
              const x = viewBox.x + viewBox.width / 2;
              const y = viewBox.y + viewBox.height + (isMobile ? 25 : 30);
              return (
                <text x={x} y={y} textAnchor="middle" fontSize={isMobile ? 10 : 12} fill="currentColor" transform={`rotate(-45 ${x} ${y})`}>
                  Schmerz
                </text>
              );
            }}
          />
          
          <YAxis
            yAxisId="temp"
            orientation="right"
            domain={['dataMin - 2', 'dataMax + 2']}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            width={isMobile ? 40 : 55}
            label={(props: any) => {
              const { viewBox } = props;
              const x = viewBox.x + viewBox.width / 2;
              const y = viewBox.y + viewBox.height + (isMobile ? 25 : 30);
              return (
                <text x={x} y={y} textAnchor="middle" fontSize={isMobile ? 10 : 12} fill="currentColor" transform={`rotate(-45 ${x} ${y})`}>
                  {isMobile ? 'Temp.' : 'Temperatur'}
                </text>
              );
            }}
          />
          
          <YAxis
            yAxisId="pressure"
            orientation="right"
            domain={['dataMin - 5', 'dataMax + 5']}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            width={isMobile ? 40 : 55}
            label={(props: any) => {
              const { viewBox } = props;
              const x = viewBox.x + viewBox.width / 2;
              const y = viewBox.y + viewBox.height + (isMobile ? 25 : 30);
              return (
                <text x={x} y={y} textAnchor="middle" fontSize={isMobile ? 10 : 12} fill="currentColor" transform={`rotate(-45 ${x} ${y})`}>
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
          
          <Line
            yAxisId="pain"
            type="monotone"
            dataKey="pain"
            stroke={chartConfig.pain.color}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
            name={chartConfig.pain.label}
          />
          
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temperature"
            stroke={chartConfig.temperature.color}
            strokeWidth={1.5}
            dot={false}
            connectNulls={true}
            isAnimationActive={false}
            name={chartConfig.temperature.label}
          />
          
          <Line
            yAxisId="pressure"
            type="monotone"
            dataKey="pressure"
            stroke={chartConfig.pressure.color}
            strokeWidth={1.5}
            dot={false}
            connectNulls={true}
            isAnimationActive={false}
            name={chartConfig.pressure.label}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}, (prevProps, nextProps) => {
  return prevProps.entries?.length === nextProps.entries?.length &&
         prevProps.dateRange?.from === nextProps.dateRange?.from &&
         prevProps.dateRange?.to === nextProps.dateRange?.to;
});

export default TimeSeriesChart;
