import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, BarChart3, Activity, Calendar, BookOpen, Database, Badge, Brain } from "lucide-react";
// Import fix for DiaryReport default export
import DiaryReport from "./DiaryReport";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { useDeleteEntry } from "@/features/entries/hooks/useEntryMutations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatisticsFilter } from "./StatisticsFilter";
import { StatisticsCards } from "./StatisticsCards";
import { TimeDistributionChart } from "./TimeDistributionChart";
import { MedicationLimitsOverview } from "./MedicationLimitsOverview";
import { VoiceNotesAIAnalysis } from "./VoiceNotesAIAnalysis";
import { useFilteredEntries, useMigraineStats, useTimeDistribution } from "@/features/statistics/hooks/useStatistics";
import { Pill, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buildModernDiaryPdf } from "@/lib/pdf/modernReport";
import { useIsMobile } from "@/hooks/use-mobile";
import { FullscreenChartModal, FullscreenChartButton } from "./FullscreenChartModal";

interface AnalysisViewProps {
  onBack: () => void;
}

export function AnalysisView({ onBack }: AnalysisViewProps) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = useState("alle");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedAuraTypes, setSelectedAuraTypes] = useState<string[]>([]);
  const [selectedPainLocations, setSelectedPainLocations] = useState<string[]>([]);
  const [analysisReport, setAnalysisReport] = useState("");
  
  // View mode for tabs
  const [viewMode, setViewMode] = useState<"statistik" | "ki-muster">("statistik");
  
  // Fullscreen modals
  const [timeDistributionFullscreen, setTimeDistributionFullscreen] = useState(false);
  const [timeSeriesFullscreen, setTimeSeriesFullscreen] = useState(false);

  // Load entries for the "alle" option calculation (limited for performance)
  const { data: allEntries = [], isLoading: entriesLoading, error: entriesError, refetch } = useEntries({ limit: 1000 });

  const { from, to } = useMemo(() => {
    const now = new Date();
    
    switch (timeRange) {
      case "7d": {
        const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return {
          from: from.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0]
        };
      }
      case "30d": {
        const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return {
          from: from.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0]
        };
      }
      case "3m": {
        const from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        return {
          from: from.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0]
        };
      }
      case "6m": {
        const from = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        return {
          from: from.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0]
        };
      }
      case "1y": {
        const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        return {
          from: from.toISOString().split('T')[0],
          to: now.toISOString().split('T')[0]
        };
      }
      case "custom": {
        const from = customFrom ? new Date(customFrom) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const to = customTo ? new Date(customTo) : now;
        return {
          from: from.toISOString().split('T')[0],
          to: to.toISOString().split('T')[0]
        };
      }
      case "alle":
      default:
        // Calculate actual range from all entries
        if (allEntries.length === 0) {
          return {
            from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            to: now.toISOString().split('T')[0],
          };
        }
        
        const dates = allEntries
          .map(entry => new Date(entry.timestamp_created))
          .filter(date => !isNaN(date.getTime()));
        
        if (dates.length === 0) {
          return {
            from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            to: now.toISOString().split('T')[0],
          };
        }
        
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        
        return {
          from: minDate.toISOString().split('T')[0],
          to: maxDate.toISOString().split('T')[0],
        };
    }
  }, [timeRange, customFrom, customTo, allEntries]);

  // Use the same entries data for consistency
  const entries = allEntries;
  const isLoading = entriesLoading;
  const error = entriesError;
  
  // Debug logging for AnalysisView
  console.log('📈 AnalysisView received data:', {
    entriesCount: entries?.length || 0,
    timeRange,
    dateRange: { from, to },
    isLoading,
    error: error?.message,
    sampleEntry: entries?.[0]
  });
  
  const deleteEntry = useDeleteEntry();

  // Use new filtered hooks for statistics
  const filters = {
    from,
    to,
    levels: selectedLevels.length > 0 ? selectedLevels : undefined,
    auraTypes: selectedAuraTypes.length > 0 ? selectedAuraTypes : undefined,
    painLocations: selectedPainLocations.length > 0 ? selectedPainLocations : undefined
  };

  const { data: filteredEntries = [] } = useFilteredEntries(filters);
  const { data: stats, isLoading: statsLoading } = useMigraineStats({ from, to });
  const { data: timeDistribution = [], isLoading: timeLoading } = useTimeDistribution({ from, to });

  const handleLevelToggle = (level: string) => {
    setSelectedLevels(prev => 
      prev.includes(level) 
        ? prev.filter(l => l !== level)
        : [...prev, level]
    );
  };

  const handleAuraTypeToggle = (type: string) => {
    setSelectedAuraTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handlePainLocationToggle = (location: string) => {
    setSelectedPainLocations(prev => 
      prev.includes(location) 
        ? prev.filter(l => l !== location)
        : [...prev, location]
    );
  };

  const handleClearFilters = () => {
    setSelectedLevels([]);
    setSelectedAuraTypes([]);
    setSelectedPainLocations([]);
  };

  const runAnalysis = () => {
    if (!filteredEntries.length) {
      setAnalysisReport("Keine Einträge im gewählten Zeitraum oder Filter gefunden.");
      return;
    }

    let report = `Migräne-Analyse vom ${from} bis ${to}\n\n`;
    report += `Gefilterte Einträge: ${filteredEntries.length}\n`;
    
    const painScores = filteredEntries.map(e => {
      switch (e.pain_level) {
        case "leicht": return 2;
        case "mittel": return 5;
        case "stark": return 7;
        case "sehr_stark": return 9;
        default: return 0;
      }
    });
    
    const avgPain = painScores.length > 0 ? (painScores.reduce((a, b) => a + b, 0) / painScores.length).toFixed(1) : "0";
    report += `Durchschnittliche Schmerzstärke: ${avgPain}/10\n`;

    const withMeds = filteredEntries.filter(e => e.medications && e.medications.length > 0).length;
    report += `Einträge mit Medikation: ${withMeds} (${((withMeds / filteredEntries.length) * 100).toFixed(1)}%)\n`;

    // Note: Filtered entries don't include weather data, use original entries for weather analysis
    const withWeather = entries.filter(e => e.weather?.temperature_c != null).length;
    if (withWeather > 0) {
      const avgTemp = entries
        .filter(e => e.weather?.temperature_c != null)
        .reduce((sum, e) => sum + (e.weather?.temperature_c || 0), 0) / withWeather;
      report += `\nWetter-Durchschnitt (${withWeather} Einträge):\n`;
      report += `Temperatur: ${avgTemp.toFixed(1)}°C\n`;
    }

    setAnalysisReport(report);
  };

  const printReport = () => {
    const html = `
      <h2>Migräne-Analysebericht</h2>
      <pre style="white-space: pre-wrap; font-family: monospace;">${analysisReport}</pre>
    `;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.print();
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <Button
          onClick={onBack}
          variant="outline"
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <h1 className="text-2xl font-bold">Auswertung & Statistiken</h1>
      </div>

      {/* Tab Navigation */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Button
              variant={viewMode === "statistik" ? "default" : "outline"}
              onClick={() => setViewMode("statistik")}
              className="flex-1"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Statistik
            </Button>
            <Button
              variant={viewMode === "ki-muster" ? "default" : "outline"}
              onClick={() => setViewMode("ki-muster")}
              className="flex-1"
            >
              <Brain className="h-4 w-4 mr-2" />
              KI-Muster
            </Button>
          </div>
        </CardContent>
      </Card>

      {viewMode === "statistik" ? (
        <>
          {/* BEREICH 1: STATISTIK */}
          <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Statistik
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Zahlen & Verläufe deiner Migräne-Einträge
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <StatisticsFilter
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            selectedLevels={selectedLevels}
            onLevelToggle={handleLevelToggle}
            selectedAuraTypes={selectedAuraTypes}
            onAuraTypeToggle={handleAuraTypeToggle}
            selectedPainLocations={selectedPainLocations}
            onPainLocationToggle={handlePainLocationToggle}
            onClearFilters={handleClearFilters}
          />

          {isLoading || statsLoading ? (
            <div className="text-center py-8">Lade Daten...</div>
          ) : error ? (
            <div className="flex justify-center py-8">
              <EmptyState
                icon="⚠️"
                title="Fehler beim Laden"
                description={`Es gab ein Problem beim Laden der Daten: ${error.message}`}
                action={{
                  label: "Erneut versuchen",
                  onClick: () => window.location.reload(),
                  variant: "outline"
                }}
              />
            </div>
           ) : entries.length === 0 ? (
              <div className="flex justify-center py-8">
                <EmptyState
                  icon="📊"
                  title="Keine Daten für Analyse"
                  description="Erstellen Sie mindestens 3-5 Migräne-Einträge, um aussagekräftige Statistiken zu erhalten."
                  action={{
                    label: "Ersten Eintrag erstellen",
                    onClick: onBack,
                    variant: "default"
                  }}
                />
              </div>
          ) : (
            <>
              {stats && (
                <StatisticsCards
                  totalEntries={stats.total_entries}
                  avgIntensity={Number(stats.avg_intensity) || 0}
                  withMedicationCount={stats.with_medication_count}
                  mostCommonTimeHour={stats.most_common_time_hour}
                  mostCommonAura={stats.most_common_aura}
                  mostCommonLocation={stats.most_common_location}
                  isLoading={statsLoading}
                />
              )}

              <div className={`grid gap-6 mb-6 ${isMobile ? 'grid-cols-1' : 'lg:grid-cols-2'}`}>
                <div className="relative">
                  <TimeDistributionChart 
                    data={timeDistribution} 
                    isLoading={timeLoading}
                  />
                  <div className="absolute top-4 right-4">
                    <FullscreenChartButton onClick={() => setTimeDistributionFullscreen(true)} />
                  </div>
                </div>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle>Intensitätsverlauf</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Zeitlicher Verlauf der Migräne-Intensität
                      </p>
                    </div>
                    <FullscreenChartButton onClick={() => setTimeSeriesFullscreen(true)} />
                  </CardHeader>
                  <CardContent>
                     <div className={isMobile ? "h-[400px]" : "h-96"}>
                       <TimeSeriesChart entries={entries} dateRange={{ from, to }} />
                     </div>
                  </CardContent>
                </Card>
              </div>

              {/* Analysis Report Section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Detailanalyse</CardTitle>
                  <div className="flex gap-2">
                    <Button onClick={runAnalysis} size="sm" variant="outline">
                      Analyse aktualisieren
                    </Button>
                    {analysisReport && (
                      <Button onClick={printReport} size="sm" variant="outline">
                        Drucken
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {analysisReport ? (
                    <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md overflow-auto">
                      {analysisReport}
                    </pre>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Klicken Sie auf "Analyse aktualisieren" für eine detaillierte Auswertung
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </CardContent>
      </Card>
        </>
      ) : (
        /* KI-Muster View */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              KI-Muster
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Automatisch erkannte Zusammenhänge aus Ihren Einträgen. Diese Hinweise ersetzen keine ärztliche Diagnose.
            </p>
          </CardHeader>
          <CardContent>
            <VoiceNotesAIAnalysis />
          </CardContent>
        </Card>
      )}

      {/* Fullscreen Modals */}
      <FullscreenChartModal
        open={timeDistributionFullscreen}
        onOpenChange={setTimeDistributionFullscreen}
        title="Tageszeit-Verteilung"
      >
        <div className="h-[calc(90vh-120px)]">
          <TimeDistributionChart 
            data={timeDistribution} 
            isLoading={timeLoading}
          />
        </div>
      </FullscreenChartModal>

      <FullscreenChartModal
        open={timeSeriesFullscreen}
        onOpenChange={setTimeSeriesFullscreen}
        title="Intensitätsverlauf"
      >
        <div className="h-[calc(90vh-120px)]">
          <TimeSeriesChart entries={entries} dateRange={{ from, to }} />
        </div>
      </FullscreenChartModal>
    </div>
  );
}