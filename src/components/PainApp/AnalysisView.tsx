import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { Trash } from "lucide-react";
import { PainEntry } from "@/types/painApp";
import ChartComponent from "@/components/Chart"; // Diese Datei gleich in Lovable anlegen

interface AnalysisViewProps {
  onBack: () => void;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({ onBack }) => {
  const [entries, setEntries] = useState<PainEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"menu" | "tagebuch" | "analyse" | "grafik">("menu");

  // Analyse-Parameter
  const [timeRange, setTimeRange] = useState<"3m" | "6m" | "12m" | "custom">("3m");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [includeMeds, setIncludeMeds] = useState(true);
  const [includeWeather, setIncludeWeather] = useState(true);
  const [analysisReport, setAnalysisReport] = useState<string>("");

  const fetchEntries = async (startDate?: string, endDate?: string) => {
    setLoading(true);
    setErrorMsg(null);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) {
      setLoading(false);
      setErrorMsg("Kein Nutzer gefunden");
      return;
    }

    let query = supabase
      .from("pain_entries")
      .select(`
        id,
        timestamp_created,
        pain_level,
        medications,
        weather:weather_logs (
          temperature_c,
          pressure_mb,
          humidity,
          condition_text
        )
      `)
      .eq("user_id", userId)
      .order("timestamp_created", { ascending: true });

    if (startDate && endDate) {
      query = query
        .gte("timestamp_created", new Date(startDate).toISOString())
        .lte("timestamp_created", new Date(endDate).toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error("Fehler beim Laden:", error);
      setErrorMsg("Fehler beim Laden der Daten");
    } else {
      const processedEntries =
        data?.map((entry) => ({
          ...entry,
          medications: entry.medications || [],
          weather: Array.isArray(entry.weather) && entry.weather.length > 0 
            ? { 
                temperature_c: entry.weather[0].temperature_c,
                pressure_mb: entry.weather[0].pressure_mb,
                humidity: entry.weather[0].humidity,
                condition_text: entry.weather[0].condition_text || 'Unknown'
              }
            : undefined,
        })) || [];
      setEntries(processedEntries);
    }
    setLoading(false);
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm("Diesen Eintrag wirklich löschen?")) return;

    const { error } = await supabase.from("pain_entries").delete().eq("id", id);
    if (error) {
      console.error("Fehler beim Löschen:", error);
      alert("Eintrag konnte nicht gelöscht werden.");
      return;
    }
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const runAnalysis = () => {
    if (entries.length === 0) {
      setAnalysisReport("Keine Daten im gewählten Zeitraum gefunden.");
      return;
    }

    const total = entries.length;
    const avgPain = (entries.reduce((sum, e) => sum + parseInt(e.pain_level), 0) / total).toFixed(2);

    let report = `Analysezeitraum: ${entries[0].timestamp_created} - ${entries[entries.length - 1].timestamp_created}\n`;
    report += `Gesamtanzahl Einträge: ${total}\n`;
    report += `Durchschnittliches Schmerzlevel: ${avgPain}\n`;

    if (includeWeather) {
      const avgTemp = (
        entries.reduce((sum, e) => sum + (e.weather?.temperature_c || 0), 0) / total
      ).toFixed(1);
      report += `Durchschnittstemperatur: ${avgTemp} °C\n`;
    }

    if (includeMeds) {
      const meds = entries.flatMap((e) => e.medications);
      const medStats: Record<string, number> = {};
      meds.forEach((m) => {
        medStats[m] = (medStats[m] || 0) + 1;
      });
      report += `Medikamente: ${Object.entries(medStats)
        .map(([m, count]) => `${m} (${count}x)`)
        .join(", ")}\n`;
    }

    setAnalysisReport(report);
  };

  const handleRunAnalysis = () => {
    let start = "";
    let end = new Date().toISOString().split("T")[0];

    if (timeRange === "3m") {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      start = d.toISOString().split("T")[0];
    } else if (timeRange === "6m") {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      start = d.toISOString().split("T")[0];
    } else if (timeRange === "12m") {
      const d = new Date();
      d.setMonth(d.getMonth() - 12);
      start = d.toISOString().split("T")[0];
    } else if (timeRange === "custom") {
      start = customStart;
      end = customEnd;
    }

    fetchEntries(start, end).then(() => {
      setTimeout(runAnalysis, 200);
    });
  };

  const printReport = () => {
    const printContent = `
      <h2>Analysebericht</h2>
      <pre>${analysisReport}</pre>
    `;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  useEffect(() => {
    if (viewMode === "tagebuch") fetchEntries();
  }, [viewMode]);

  if (loading && viewMode !== "menu") {
    return <p className="p-4">Lade Daten...</p>;
  }

  if (errorMsg && viewMode !== "menu") {
    return <p className="p-4 text-destructive">{errorMsg}</p>;
  }

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
    return (
      <div className="p-4">
        <Button onClick={() => setViewMode("menu")} className="mb-4">← Zurück</Button>
        <h1 className="text-2xl font-bold mb-4">Kopfschmerztagebuch</h1>
        {entries.map((entry) => (
          <div key={entry.id} className="p-4 border rounded-lg bg-card shadow mb-4">
            <div className="flex justify-between">
              <div>
                <p className="text-sm">{new Date(entry.timestamp_created).toLocaleString()}</p>
                <p className="font-semibold">Schmerzlevel: {entry.pain_level}</p>
              </div>
              <Button onClick={() => deleteEntry(entry.id)} variant="destructive" size="sm"><Trash className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === "analyse") {
    return (
      <div className="p-4">
        <Button onClick={() => setViewMode("menu")} className="mb-4">← Zurück</Button>
        <h1 className="text-2xl font-bold mb-4">Analyse</h1>

        {/* Parameter */}
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

        <Button onClick={handleRunAnalysis} className="mb-4">Analyse starten</Button>

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

  return null;
};
