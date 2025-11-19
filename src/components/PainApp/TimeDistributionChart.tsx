import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Clock } from "lucide-react";

interface TimeDistribution {
  hour_of_day: number;
  entry_count: number;
}

interface TimeDistributionChartProps {
  data: TimeDistribution[];
  isLoading?: boolean;
}

export const TimeDistributionChart = React.memo(function TimeDistributionChart({ 
  data, 
  isLoading = false 
}: TimeDistributionChartProps) {
  // Create full 24-hour data with zeros for missing hours
  const fullDayData = Array.from({ length: 24 }, (_, hour) => {
    const existing = data.find(d => d.hour_of_day === hour);
    return {
      hour: hour,
      count: existing?.entry_count || 0,
      label: `${hour.toString().padStart(2, '0')}:00`
    };
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Tageszeit-Verteilung
          </CardTitle>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Lade Daten...</div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Tageszeit-Verteilung
          </CardTitle>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <div className="text-muted-foreground">Keine Daten für diesen Zeitraum</div>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...fullDayData.map(d => d.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Tageszeit-Verteilung
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Anzahl Migräne-Episoden nach Tageszeit
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80" style={{ minHeight: '320px', maxHeight: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fullDayData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="hour" 
                tick={{ fontSize: 10 }}
                interval={1}
                tickFormatter={(value) => `${value.toString().padStart(2, '0')}h`}
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                domain={[0, Math.max(1, maxCount)]}
              />
              <Tooltip 
                formatter={(value: number) => [value, 'Episoden']}
                labelFormatter={(hour: number) => `${hour.toString().padStart(2, '0')}:00 Uhr`}
              />
              <Bar 
                dataKey="count" 
                fill="hsl(var(--primary))" 
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  return prevProps.isLoading === nextProps.isLoading &&
         JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
});