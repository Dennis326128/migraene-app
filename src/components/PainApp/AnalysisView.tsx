import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash } from "lucide-react";
import { PainEntry } from "@/types/painApp";
import ChartComponent from "@/components/Chart";
import DiaryReport from "@/components/PainApp/DiaryReport";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { useDeleteEntry } from "@/features/entries/hooks/useEntryMutations";
import { formatPainLevel, mapTextLevelToScore } from "@/lib/utils/pain";

interface AnalysisViewProps {
  onBack: () => void;
}

type Range = "3m" | "6m" | "12m" | "custom";

export const AnalysisView: React.FC<AnalysisViewProps> = ({ onBack }) => {
  const [viewMode, setViewMode] = useState<"menu" | "tagebuch" | "analyse" | "grafik">("menu");
  const [timeRange, setTimeRange] = useState<Range>("3m");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const [includeMeds, setIncludeMeds] = useState(true);
  const [includeWeather, setIncludeWeather] = useState(true);
  const [analysisReport, setAnalysisReport] = useState<string>("");

  const { from, to } = useMemo(() => {
    const end = (timeRange === "custom" && customEnd) ? customEnd : new Date().toISOString().slice(0,10);
    const d = new Date();
    const start =
      timeRange === "custom" && customStart ? customStart :
      timeRange === "3m" ? (()=>{ const x=new Date(d); x.setMonth(d.getMonth()-3); return x.toISOString().slice(0,10); })() :
      timeRange === "6m" ? (()=>{ const x=new Date(d); x.setMonth(d.getMonth()-6); return x.toISOString().slice(0,10); })() :
      (()=>{ const x=new Date(d); x.setMonth(d.getMonth()-12); return x.toISOString().slice(0,10); })();
    return { from: start, to: end };
  }, [timeRange, customStart, customEnd]);

  const { data: entries = [], isLoading, isError, refetch } = useEntries({ from, to });
  const { mutate: deleteMutate } = useDeleteEntry();

  useEffect(() => {
    if (viewMode === "analyse") {
      // sicherstellen, dass Daten für Zeitraum frisch sind
      refetch();
    }
  }, [viewMode, refetch]);

  const runAnalysis = () => {
    if (!entries.length) {
      setAnalysisReport("Keine Daten im gewählten Zeitraum gefunden.");
      return;
    }
    const total = entries.length;
    const avgPain = (entries.reduce((sum, e) => sum + mapTextLevelToScore(e.pain_level), 0) / total).toFixed(2);

    let report = `Analysezeitraum: ${from} - ${to}\n`;
    report += `Gesamtanzahl Einträge: ${total}\n`;
    report += `Durchschnittliches Schmerzlevel: ${avgPain}\n`;

    if (includeWeather) {
      const countWithWeather = entries.filter(e => e.weather?.temperature_c != null).length;
      const avgTemp = countWithWeather
        ? (entries.reduce((s, e) => s + (e.weather?.temperature_c ?? 0), 0) / countWithWeather).toFixed(1)
        : "–";
      report += `Durchschnittstemperatur (nur Einträge mit Wetter): ${avgTemp} °C\n`;
    }

    if (includeMeds) {
      const meds = entries.flatMap((e) => e.medications || []);
      const medStats: Record<string, number> = {};
      meds.forEach((m) => { medStats[m] = (medStats[m] || 0) + 1; });
      const medsLine = Object.keys(medStats).length
        ? Object.entries(medStats).map(([m, c]) => `${m} (${c}x)`).join(", ")
        : "Keine";
      report += `Medikamente: ${medsLine}\n`;
    }

    setAnalysisReport(report);
  };

  const printReport = () => {
    const html = `
      <h2>Analysebericht</h2>
      <pre>${analysisReport}</pre>
    `;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  if (viewMode === "menu") {
    return (
      <div className="p-4">
        <Button onClick={onBack} className="mb-6">← Zurück</Button>
        <h1 className="text-2xl font-bold mb-6">Auswertungen & Berichte</h1>
        <div className="space-y-4">
          <Button onClick={() => setViewMode("tagebuch")} variant="secondary" size="lg" className="w-full">📄 Kopfschmerztagebuch (PDF)</Button>
          <Button onClick={() => setViewMode("analyse")} variant="secondary" size="lg" className="w-full">🤖 Analyse (Schmerz + Wetter)</Button>
          <Button onClick={() => setViewMode("grafik")} variant="secondary" size="lg" className="w-full">📊 Grafische Darstellung</Button>
        </div>
      </div>
    );
  }

  if (viewMode === "tagebuch") {
    return <DiaryReport onBack={() => setViewMode("menu")} />;
  }

  if (viewMode === "analyse" || viewMode === "grafik") {
    // Ladeindikatoren nur in Unteransichten zeigen
    if (isLoading) return <p className="p-4">Lade Daten...</p>;
    if (isError)   return <p className="p-4 text-destructive">Fehler beim Laden der Daten.</p>;
  }

  if (viewMode === "analyse") {
    return (
      <div className="p-4">
        <Button onClick={() => setViewMode("menu")} className="mb-4">← Zurück</Button>
        <h1 className="text-2xl font-bold mb-4">Analyse</h1>

        <label>Zeitraum:</label>
        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value as any)} className="border p-2 w-full mb-4">
          <option value="3m">Letzte 3 Monate</option>
          <option value="6m">Letzte 6 Monate</option>
          <option value="12m">Letzte 12 Monate</option>
          <option value="custom">Benutzerdefiniert</option>
        </select>

        {timeRange === "custom" && (
          <div className="flex gap-2 mb-4">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border p-2 w-full" />
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border p-2 w-full" />
          </div>
        )}

        <label className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={includeMeds} onChange={(e) => setIncludeMeds(e.target.checked)} /> Medikamente einbeziehen
        </label>
        <label className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={includeWeather} onChange={(e) => setIncludeWeather(e.target.checked)} /> Wetterdaten einbeziehen
        </label>

        <Button onClick={runAnalysis} className="mb-4">Analyse starten</Button>

        {analysisReport && (
          <div className="border p-4 rounded bg-gray-50 mb-4 whitespace-pre-wrap">
            {analysisReport}
            <div className="mt-2 flex gap-2">
              <Button onClick={printReport}>PDF/Print</Button>
            </div>
          </div>
        )}

        {entries.length > 0 && <ChartComponent entries={entries} />}
      </div>
    );
  }

  if (viewMode === "grafik") {
    return (
      <div className="p-4">
        <Button onClick={() => setViewMode("menu")} className="mb-4">← Zurück</Button>
        <h1 className="text-2xl font-bold mb-4">Grafische Darstellung</h1>
        <ChartComponent entries={entries} />
      </div>
    );
  }

  // Fallback
  return null;
};