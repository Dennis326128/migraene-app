import React, { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { useWeatherTimeline } from "@/features/weather/hooks/useWeatherTimeline";
import { useIsMobile } from "@/hooks/use-mobile";
import { MigraineEntry } from "@/types/painApp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, differenceInDays, startOfDay, endOfDay } from "date-fns";
import { buildDailySeries, generateTimeTicks, formatTimeAxisLabel, type DailySeriesPoint } from "@/lib/chartDataUtils";

interface Props {
  entries: MigraineEntry[];
  dateRange?: {
    from?: string;
    to?: string;
  };
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

  const startDate = useMemo(() => startOfDay(parseISO(actualDateRange.from)), [actualDateRange.from]);
  const endDate = useMemo(() => endOfDay(parseISO(actualDateRange.to)), [actualDateRange.to]);
  const daysDiff = useMemo(() => differenceInDays(endDate, startDate), [endDate, startDate]);

  console.log('📊 Chart date range:', {
    requested: dateRange,
    actual: actualDateRange,
    startDate,
    endDate,
    daysDiff,
    totalEntries: entries?.length || 0
  });

  // Get weather timeline data for the actual date range
  const { data: weatherTimeline = [] } = useWeatherTimeline(
    actualDateRange.from,
    actualDateRange.to,
    showPassiveWeather
  );

  // Build daily time series with proper data aggregation
  const dailySeries = useMemo(() => {
    const series = buildDailySeries(entries || [], startDate, endDate, weatherTimeline);
    
    console.log('📊 Daily series built:', {
      totalDays: series.length,
      daysWithPain: series.filter(d => d.pain !== null).length,
      daysWithWeather: series.filter(d => d.hasWeather).length,
      firstDay: series[0]?.date,
      lastDay: series[series.length - 1]?.date
    });
    
    return series;
  }, [entries, startDate, endDate, weatherTimeline]);

  // Generate X-axis ticks
  const xAxisTicks = useMemo(() => {
    return generateTimeTicks(dailySeries, isMobile ? 4 : 8);
  }, [dailySeries, isMobile]);

  // Calculate weather correlation
  const weatherCorrelation = useMemo(() => {
    const dataWithPainAndWeather = dailySeries.filter(d => d.pain !== null && d.pressure !== null);
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
  }, [dailySeries]);

  // Show empty state if no entries in the time range
  const entriesInRange = dailySeries.filter(d => d.pain !== null);
  if (entriesInRange.length === 0) {
    const totalEntries = entries?.length || 0;
    
    return (
      <div className="space-y-4">
        {/* Empty chart with axes */}
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={dailySeries}
              margin={{
                top: 5,
                right: isMobile ? 10 : 30,
                left: isMobile ? 10 : 20,
                bottom: isMobile ? 20 : 5,
              }}
            >
              <XAxis
                type="number"
                scale="time"
                dataKey="ts"
                domain={[startDate.getTime(), endDate.getTime()]}
                ticks={xAxisTicks}
                tickFormatter={(ts) => formatTimeAxisLabel(ts, daysDiff)}
                tick={{ fontSize: isMobile ? 10 : 12 }}
                angle={isMobile ? -45 : 0}
                textAnchor={isMobile ? "end" : "middle"}
                height={isMobile ? 60 : 30}
              />
              <YAxis
                yAxisId="pain"
                orientation="left"
                domain={[0, 10]}
                tick={{ fontSize: isMobile ? 10 : 12 }}
                label={!isMobile ? { value: 'Schmerzstärke', angle: -90, position: 'insideLeft' } : undefined}
              />
              <YAxis
                yAxisId="pressure"
                orientation="right"
                domain={[980, 1040]}
                tick={{ fontSize: isMobile ? 10 : 12 }}
                label={!isMobile ? { value: 'Luftdruck (mb)', angle: 90, position: 'insideRight' } : undefined}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="text-center py-8 text-muted-foreground">
          <div className="text-lg mb-2">📈</div>
          <div className="space-y-2">
            <div className="text-sm">Keine Einträge im Zeitraum</div>
            <div className="text-xs">
              {format(startDate, 'dd.MM.yyyy')} - {format(endDate, 'dd.MM.yyyy')}
            </div>
            {totalEntries > 0 && (
              <div className="text-xs">
                {totalEntries} Einträge insgesamt vorhanden - wählen Sie einen anderen Zeitraum
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Calculate data quality metrics
  const dataQuality = useMemo(() => {
    const entriesWithData = dailySeries.filter(d => d.pain !== null);
    const entriesWithWeather = dailySeries.filter(d => d.pain !== null && d.hasWeather);
    const weatherPercentage = entriesWithData.length > 0 ? Math.round((entriesWithWeather.length / entriesWithData.length) * 100) : 0;
    
    return {
      totalDays: dailySeries.length,
      daysWithEntries: entriesWithData.length,
      daysWithWeather: entriesWithWeather.length,
      weatherPercentage
    };
  }, [dailySeries]);

  const hasWeatherData = dailySeries.some(d => d.pressure !== null || d.temp !== null);

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
            data={dailySeries}
            margin={{
              top: 5,
              right: isMobile ? 10 : 30,
              left: isMobile ? 10 : 20,
              bottom: isMobile ? 20 : 5,
            }}
          >
            <XAxis
              type="number"
              scale="time"
              dataKey="ts"
              domain={[startDate.getTime(), endDate.getTime()]}
              ticks={xAxisTicks}
              tickFormatter={(ts) => formatTimeAxisLabel(ts, daysDiff)}
              tick={{ fontSize: isMobile ? 10 : 12 }}
              angle={isMobile ? -45 : 0}
              textAnchor={isMobile ? "end" : "middle"}
              height={isMobile ? 60 : 30}
            />
            <YAxis
              yAxisId="pain"
              orientation="left"
              domain={[0, 10]}
              tick={{ fontSize: isMobile ? 10 : 12 }}
              label={!isMobile ? { value: 'Schmerzstärke', angle: -90, position: 'insideLeft' } : undefined}
            />
            {hasWeatherData && (
              <>
                <YAxis
                  yAxisId="temp"
                  orientation="right"
                  domain={['dataMin - 2', 'dataMax + 2']}
                  tick={{ fontSize: isMobile ? 8 : 10 }}
                  label={!isMobile ? { value: 'Temperatur (°C)', angle: 90, position: 'outside', offset: 10 } : undefined}
                />
                <YAxis
                  yAxisId="pressure"
                  orientation="right"
                  domain={['dataMin - 5', 'dataMax + 5']}
                  tick={{ fontSize: isMobile ? 8 : 10 }}
                  label={!isMobile ? { value: 'Luftdruck (mb)', angle: 90, position: 'outside', offset: 40 } : undefined}
                />
              </>
            )}
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0].payload as DailySeriesPoint;
                
                // Don't show tooltip for completely empty data points
                if (data.pain === null && data.pressure === null && data.temp === null) return null;
                
                return (
                  <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
                    <p className="font-medium">{format(new Date(data.ts), 'dd.MM.yyyy (EEE)')}</p>
                    {data.pain !== null ? (
                      <p className="text-sm">
                        <span className="text-blue-500">●</span> Schmerz: {data.pain}/10 ({data.painLevel})
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Kein Schmerzwert</p>
                    )}
                    {data.aura && <p className="text-xs">Aura: {data.aura}</p>}
                    {data.location && <p className="text-xs">Ort: {data.location}</p>}
                    {data.medications && data.medications > 0 && <p className="text-xs">Medikamente: {data.medications}</p>}
                    {data.entriesCount > 1 && <p className="text-xs">{data.entriesCount} Einträge</p>}
                    {data.pressure && (
                      <p className="text-sm">
                        <span className="text-orange-500">●</span> Luftdruck: {data.pressure}mb
                      </p>
                    )}
                    {data.temp && <p className="text-sm">
                      <span className="text-green-500">●</span> Temperatur: {data.temp}°C
                    </p>}
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
              isAnimationActive={false}
            />
            
            {/* Temperature Line */}
            {hasWeatherData && (
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temp"
                stroke="hsl(var(--chart-2))"
                strokeWidth={1}
                dot={{ r: 2, fill: "hsl(var(--chart-2))" }}
                connectNulls={false}
                name="Temperatur (°C)"
                strokeDasharray="5 5"
                isAnimationActive={false}
              />
            )}
            
            {/* Pressure Line */}
            {hasWeatherData && (
              <Line
                yAxisId="pressure"
                type="monotone"
                dataKey="pressure"
                stroke="hsl(var(--chart-3))"
                strokeWidth={1}
                dot={{ r: 2, fill: "hsl(var(--chart-3))" }}
                connectNulls={false}
                name="Luftdruck (mb)"
                strokeDasharray="3 3"
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}