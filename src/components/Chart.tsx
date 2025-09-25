import React, { useMemo } from "react";
import type { PainEntry } from "@/types/painApp";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { mapTextLevelToScore } from "@/lib/utils/pain";

type Props = { entries: PainEntry[] };

function toLabel(e: PainEntry) {
  if (e.selected_date && e.selected_time) return `${e.selected_date} ${e.selected_time}`;
  const d = new Date(e.timestamp_created);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default function ChartComponent({ entries }: Props) {
  // Debug logging to see what data we receive
  console.log('📊 Chart component received:', {
    entriesCount: entries?.length || 0,
    firstEntry: entries?.[0],
    lastEntry: entries?.[entries?.length - 1]
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

  if (!data.length) return <div className="text-sm text-muted-foreground">Keine Daten für die Grafik.</div>;

  return (
    <div className="w-full space-y-4">
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

      <div className="w-full" style={{ height: "min(70vh, 400px)" }}>
        <ResponsiveContainer>
          <LineChart 
            data={data} 
            margin={{ 
              top: 10, 
              right: window.innerWidth < 768 ? 12 : 24, 
              left: window.innerWidth < 768 ? 8 : 16, 
              bottom: window.innerWidth < 768 ? 20 : 10 
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: window.innerWidth < 768 ? 8 : 10 }} 
              interval="preserveStartEnd"
              angle={window.innerWidth < 768 ? -45 : 0}
              textAnchor={window.innerWidth < 768 ? "end" : "middle"}
              height={window.innerWidth < 768 ? 60 : 30}
            />
            <YAxis 
              yAxisId="pain" 
              domain={[0, 10]} 
              tick={{ fontSize: window.innerWidth < 768 ? 8 : 10 }} 
              label={{ 
                value: window.innerWidth < 768 ? "Schmerz" : "Schmerz (0-10)", 
                angle: -90, 
                position: "insideLeft",
                style: { textAnchor: 'middle' }
              }} 
            />
            <YAxis 
              yAxisId="pressure" 
              orientation="right" 
              domain={[950, 1050]}
              tick={{ fontSize: window.innerWidth < 768 ? 8 : 10 }} 
              label={{ 
                value: "hPa", 
                angle: 90, 
                position: "insideRight",
                style: { textAnchor: 'middle' }
              }} 
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px hsl(var(--background) / 0.1)',
                fontSize: window.innerWidth < 768 ? '12px' : '14px'
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
              wrapperStyle={{ fontSize: window.innerWidth < 768 ? '12px' : '14px' }}
            />
            <Line 
              yAxisId="pain" 
              type="monotone" 
              dataKey="pain" 
              name="Schmerz" 
              dot={false} 
              strokeWidth={window.innerWidth < 768 ? 3 : 2}
              stroke="hsl(var(--destructive))"
            />
            <Line 
              yAxisId="pressure" 
              type="monotone" 
              dataKey="pressure" 
              name="Luftdruck" 
              dot={false} 
              strokeWidth={window.innerWidth < 768 ? 2 : 1}
              stroke="hsl(var(--primary))"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}