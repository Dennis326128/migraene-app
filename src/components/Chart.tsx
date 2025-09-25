import React, { useMemo } from "react";
import type { PainEntry } from "@/types/painApp";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { mapTextLevelToScore } from "@/lib/utils/pain";
import { useIsMobile } from "@/hooks/use-mobile";

type Props = { entries: PainEntry[] };

function toLabel(e: PainEntry) {
  if (e.selected_date && e.selected_time) return `${e.selected_date} ${e.selected_time}`;
  const d = new Date(e.timestamp_created);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default function ChartComponent({ entries }: Props) {
  const isMobile = useIsMobile();
  
  // Debug logging to see what data we receive
  console.log('📊 Chart component received:', {
    entriesCount: entries?.length || 0,
    firstEntry: entries?.[0],
    lastEntry: entries?.[entries?.length - 1],
    isMobile
  });

  const data = useMemo(() => {
    const processedData = (entries || []).map(e => {
      const weather = e.weather;
      return {
        label: toLabel(e),
        pain: mapTextLevelToScore(e.pain_level),
        pressure: weather?.pressure_mb ?? null,
        temperature: weather?.temperature_c ?? null,
        humidity: weather?.humidity ?? null,
        // Weather correlation indicator
        weatherRisk: weather?.pressure_mb ? 
          (weather.pressure_mb < 1000 ? 'Niedrigdruck' : 
           weather.pressure_mb > 1020 ? 'Hochdruck' : 'Normal') : null,
        hasWeather: !!weather?.pressure_mb
      };
    });

    console.log('📊 Chart processed data:', {
      processedCount: processedData.length,
      sampleData: processedData.slice(0, 3),
      painLevels: processedData.map(d => d.pain)
    });

    return processedData;
  }, [entries]);

  // Calculate weather correlation
  const weatherCorrelation = useMemo(() => {
    const withWeather = data.filter(d => d.hasWeather && d.pressure !== null);
    if (withWeather.length < 2) return null;

    const lowPressureEntries = withWeather.filter(d => d.pressure! < 1000);
    const normalPressureEntries = withWeather.filter(d => d.pressure! >= 1000 && d.pressure! <= 1020);
    const highPressureEntries = withWeather.filter(d => d.pressure! > 1020);

    const avgPainByPressure = {
      niedrig: lowPressureEntries.length > 0 ? 
        lowPressureEntries.reduce((sum, d) => sum + d.pain, 0) / lowPressureEntries.length : 0,
      normal: normalPressureEntries.length > 0 ? 
        normalPressureEntries.reduce((sum, d) => sum + d.pain, 0) / normalPressureEntries.length : 0,
      hoch: highPressureEntries.length > 0 ? 
        highPressureEntries.reduce((sum, d) => sum + d.pain, 0) / highPressureEntries.length : 0
    };

    return avgPainByPressure;
  }, [data]);

  if (!data.length) return (
    <div className="text-center py-8 text-muted-foreground">
      <div className="text-lg mb-2">📈</div>
      <div className="text-sm">Keine Daten für die Grafik</div>
    </div>
  );

  // Calculate data availability
  const dataAvailability = useMemo(() => {
    const totalEntries = data.length;
    const entriesWithWeather = data.filter(d => d.hasWeather).length;
    const weatherPercentage = totalEntries > 0 ? (entriesWithWeather / totalEntries) * 100 : 0;
    
    return {
      totalEntries,
      entriesWithWeather,
      weatherPercentage: Math.round(weatherPercentage)
    };
  }, [data]);

  return (
    <div className="w-full space-y-4">
      {/* Data Quality Indicator */}
      <div className="bg-muted/50 p-3 rounded-lg">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-sm">📊</span>
            <span>
              <strong>{data.length}</strong> Schmerzeinträge
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">🌤️</span>
            <span>
              <strong>{dataAvailability.entriesWithWeather}</strong> mit Wetterdaten ({dataAvailability.weatherPercentage}%)
            </span>
          </div>
        </div>
      </div>

      {/* Weather Correlation Summary */}
      {weatherCorrelation && (
        <div className="bg-muted/50 p-3 rounded-lg">
          <h4 className="text-sm font-medium mb-2">🌤️ Wetter-Korrelation</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <div className="font-medium text-blue-600">Niedrigdruck</div>
              <div>{weatherCorrelation.niedrig.toFixed(1)}/10</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-green-600">Normaldruck</div>
              <div>{weatherCorrelation.normal.toFixed(1)}/10</div>
            </div>
            <div className="text-center">
              <div className="font-medium text-orange-600">Hochdruck</div>
              <div>{weatherCorrelation.hoch.toFixed(1)}/10</div>
            </div>
          </div>
        </div>
      )}

      <div className="w-full" style={{ height: isMobile ? "250px" : "min(70vh, 400px)" }}>
        <ResponsiveContainer>
          <LineChart 
            data={data} 
            margin={{ 
              top: 10, 
              right: isMobile ? 8 : 24, 
              left: isMobile ? 4 : 16, 
              bottom: isMobile ? 50 : 10 
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: isMobile ? 8 : 10 }} 
              interval={isMobile ? Math.max(Math.floor(data.length / 4), 1) : "preserveStartEnd"}
              angle={isMobile ? -60 : 0}
              textAnchor={isMobile ? "end" : "middle"}
              height={isMobile ? 60 : 30}
            />
            <YAxis 
              yAxisId="pain" 
              domain={[0, 10]} 
              tick={{ fontSize: isMobile ? 8 : 10 }} 
              label={{ 
                value: isMobile ? "Pain" : "Schmerz (0-10)", 
                angle: -90, 
                position: "insideLeft",
                style: { textAnchor: 'middle', fontSize: isMobile ? 10 : 12 }
              }} 
            />
            <YAxis 
              yAxisId="pressure" 
              orientation="right" 
              domain={[950, 1050]}
              tick={{ fontSize: isMobile ? 8 : 10 }} 
              label={{ 
                value: "hPa", 
                angle: 90, 
                position: "insideRight",
                style: { textAnchor: 'middle', fontSize: isMobile ? 10 : 12 }
              }} 
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px hsl(var(--background) / 0.1)',
                fontSize: isMobile ? '11px' : '14px',
                padding: isMobile ? '8px' : '12px',
                minWidth: isMobile ? '120px' : 'auto'
              }}
              formatter={(value, name) => {
                if (name === 'pain') return [`${value}/10`, 'Schmerzlevel'];
                if (name === 'pressure') return [`${value} hPa`, 'Luftdruck'];
                if (name === 'temperature') return [`${value}°C`, 'Temperatur'];
                if (name === 'humidity') return [`${value}%`, 'Luftfeuchtigkeit'];
                return [value, name];
              }}
            />
            <Legend 
              wrapperStyle={{ 
                fontSize: isMobile ? '11px' : '14px',
                paddingTop: isMobile ? '8px' : '4px'
              }}
            />
            <Line 
              yAxisId="pain" 
              type="monotone" 
              dataKey="pain" 
              name="Schmerz" 
              dot={{ r: isMobile ? 3 : 4, strokeWidth: 2 }} 
              strokeWidth={isMobile ? 3 : 3}
              stroke="hsl(var(--destructive))"
              connectNulls={true}
            />
            {dataAvailability.entriesWithWeather > 0 && (
              <Line 
                yAxisId="pressure" 
                type="monotone" 
                dataKey="pressure" 
                name="Luftdruck" 
                dot={{ r: isMobile ? 1 : 2, strokeWidth: 1 }} 
                strokeWidth={isMobile ? 1.5 : 1}
                stroke="hsl(var(--primary))"
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}