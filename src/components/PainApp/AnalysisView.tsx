import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, BarChart3, Activity, Calendar, BookOpen, Database, Badge } from "lucide-react";
// Import fix for DiaryReport default export
import DiaryReport from "./DiaryReport";
import ChartComponent from "@/components/Chart";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { useSystemStatus } from "@/hooks/useCompatibleEntries";
import { useDeleteEntry } from "@/features/entries/hooks/useEntryMutations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatisticsFilter } from "./StatisticsFilter";
import { StatisticsCards } from "./StatisticsCards";
import { TimeDistributionChart } from "./TimeDistributionChart";
import { MigrationPanel } from "./MigrationPanel";
import { MedicationLimitsOverview } from "./MedicationLimitsOverview";
import { useFilteredEntries, useMigraineStats, useTimeDistribution } from "@/features/statistics/hooks/useStatistics";
import { Pill, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buildModernDiaryPdf } from "@/lib/pdf/modernReport";
import { useIsMobile } from "@/hooks/use-mobile";

interface AnalysisViewProps {
  onBack: () => void;
}

export function AnalysisView({ onBack }: AnalysisViewProps) {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<"tagebuch" | "analyse" | "grafik" | "ueberverbrauch" | "migration">("grafik");
  const [timeRange, setTimeRange] = useState("alle");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedAuraTypes, setSelectedAuraTypes] = useState<string[]>([]);
  const [selectedPainLocations, setSelectedPainLocations] = useState<string[]>([]);
  const [analysisReport, setAnalysisReport] = useState("");

  // Check system status for migration recommendations
  const { data: systemStatus } = useSystemStatus();

  // Load ALL entries first to calculate date range for "alle"
  const { data: allEntries = [], isLoading: entriesLoading, error: entriesError, refetch } = useEntries();

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

  useEffect(() => {
    if (viewMode === "analyse") {
      refetch();
    }
  }, [viewMode, refetch]);

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

      {/* View Mode Selector */}
      <Card className={isMobile ? "mb-4 sticky top-0 z-10 shadow-md" : "mb-4"}>
        <CardContent className="p-4">
          <div className={`flex gap-2 ${isMobile ? 'overflow-x-auto scrollbar-hide pb-2' : 'flex-wrap'}`}>
            {[
              { id: "tagebuch", label: isMobile ? "📋" : "📋 Tagebuch", icon: FileText },
              { id: "analyse", label: isMobile ? "📊" : "📊 Analyse", icon: BarChart3 },
              { id: "grafik", label: isMobile ? "📈" : "📈 Grafik", icon: Activity },
              { id: "ueberverbrauch", label: isMobile ? "📊" : "Übergebrauch", icon: AlertTriangle },
              { id: "migration", label: isMobile ? "🔄" : "🔄 Migration", icon: Database },
            ].map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={viewMode === id ? "default" : "outline"}
                size={isMobile ? "sm" : "sm"}
                onClick={() => setViewMode(id as any)}
                className={`${isMobile ? 'text-xs min-w-fit px-3 whitespace-nowrap' : 'text-xs'} touch-manipulation`}
              >
                {isMobile ? (
                  <span className="text-sm">{label}</span>
                ) : (
                  <>
                    <Icon className="mr-1 h-3 w-3" />
                    {label}
                  </>
                )}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Content based on view mode */}
      {viewMode === "tagebuch" && (
        <DiaryReport onBack={() => setViewMode("tagebuch")} />
      )}

      {viewMode === "analyse" && (
        <>
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
                 description={systemStatus?.needsMigration 
                   ? `Es sind ${systemStatus.painEntries} Legacy-Einträge vorhanden. Führen Sie die Migration durch, um sie zu analysieren.`
                   : "Erstellen Sie mindestens 3-5 Migräne-Einträge, um aussagekräftige Statistiken zu erhalten."
                 }
                 action={{
                   label: systemStatus?.needsMigration ? "Zur Migration" : "Ersten Eintrag erstellen",
                   onClick: systemStatus?.needsMigration ? () => setViewMode("migration") : onBack,
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <TimeDistributionChart 
                  data={timeDistribution} 
                  isLoading={timeLoading}
                />
                
                <Card>
                  <CardHeader>
                    <CardTitle>Intensitätsverlauf</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Zeitlicher Verlauf der Migräne-Intensität
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ChartComponent entries={entries} dateRange={{ from, to }} />
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
        </>
      )}

      {viewMode === "grafik" && (
        <>
          {isLoading ? (
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
                icon="📈"
                title="Keine Daten für Grafik"
                description="Erstellen Sie mindestens 3-5 Migräne-Einträge, um grafische Auswertungen zu sehen."
                action={{
                  label: "Ersten Eintrag erstellen",
                  onClick: onBack,
                  variant: "default"
                }}
              />
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Intensitätsverlauf</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Grafische Darstellung der Migräne-Einträge über Zeit
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button
                    variant={timeRange === "30d" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      console.log("Setting timeRange to 30d, current from/to:", from, to);
                      setTimeRange("30d");
                    }}
                  >
                    30 Tage
                  </Button>
                  <Button
                    variant={timeRange === "3m" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      console.log("Setting timeRange to 3m, current from/to:", from, to);
                      setTimeRange("3m");
                    }}
                  >
                    3 Monate
                  </Button>
                  <Button
                    variant={timeRange === "6m" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      console.log("Setting timeRange to 6m, current from/to:", from, to);
                      setTimeRange("6m");
                    }}
                  >
                    6 Monate
                  </Button>
                  <Button
                    variant={timeRange === "1y" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      console.log("Setting timeRange to 1y, current from/to:", from, to);
                      setTimeRange("1y");
                    }}
                  >
                    12 Monate
                  </Button>
                  <Button
                    variant={timeRange === "alle" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      console.log("Setting timeRange to alle, current from/to:", from, to);
                      setTimeRange("alle");
                    }}
                  >
                    Alle
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ChartComponent 
                  key={`${timeRange}-${from}-${to}`}
                  entries={entries} 
                  dateRange={{ from, to }} 
                  timeRange={timeRange}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}


      {viewMode === "ueberverbrauch" && (
        <MedicationLimitsOverview />
      )}

      {viewMode === "migration" && (
        <div className="space-y-6">
          <MigrationPanel />
          <Card>
            <CardHeader>
              <CardTitle>Was bietet das neue System?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium">📊 Erweiterte Analysen</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Medikamenten-Wirksamkeit tracking</li>
                    <li>• Detaillierte Symptom-Korrelationen</li>
                    <li>• Verbesserte Wetter-Analysen</li>
                    <li>• Zeitbasierte Trend-Erkennung</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">💊 Smart Medication</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Automatische Wirksamkeits-Erinnerungen</li>
                    <li>• Dosierung und Einnahme-Zeitpunkte</li>
                    <li>• Überverbrauch-Warnungen</li>
                    <li>• Medikamenten-Interaktionen</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}