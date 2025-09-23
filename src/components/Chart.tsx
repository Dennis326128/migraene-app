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
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis yAxisId="pain" domain={[0, 10]} tick={{ fontSize: 10 }} label={{ value: "Schmerz (0-10)", angle: -90, position: "insideLeft" }} />
          <YAxis yAxisId="pressure" orientation="right" tick={{ fontSize: 10 }} label={{ value: "hPa", angle: 90, position: "insideRight" }} />
          <Tooltip />
          <Legend />
          <Line yAxisId="pain" type="monotone" dataKey="pain" name="Schmerz" dot={false} strokeWidth={2} />
          <Line yAxisId="pressure" type="monotone" dataKey="pressure" name="Luftdruck" dot={false} strokeWidth={1} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}