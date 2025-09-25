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
  const data = useMemo(() => {
    return (entries || []).map(e => ({
      label: toLabel(e),
      pain: mapTextLevelToScore(e.pain_level),
      pressure: e.weather?.pressure_mb ?? null,
    }));
  }, [entries]);

  if (!data.length) return <div className="text-sm text-muted-foreground">Keine Daten für die Grafik.</div>;

  return (
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
            stroke="hsl(var(--primary))"
          />
          <Line 
            yAxisId="pressure" 
            type="monotone" 
            dataKey="pressure" 
            name="Luftdruck" 
            dot={false} 
            strokeWidth={window.innerWidth < 768 ? 2 : 1}
            stroke="hsl(var(--secondary))"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}