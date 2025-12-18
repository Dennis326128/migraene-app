import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Brain } from "lucide-react";
import { TimeRangeButtons, type TimeRangePreset } from "./TimeRangeButtons";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PatternCards } from "./PatternCards";
import { TimeDistributionChart } from "./TimeDistributionChart";
import { VoiceNotesAIAnalysis } from "./VoiceNotesAIAnalysis";
import { useTimeDistribution } from "@/features/statistics/hooks/useStatistics";
import { useMedicationEffectsForEntries } from "@/features/medication-effects/hooks/useMedicationEffects";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { computeStatistics } from "@/lib/statistics";
import type { MedicationEffect, MedicationLimit, EntrySymptom } from "@/lib/statistics";
import { AlertTriangle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { FullscreenChartModal, FullscreenChartButton } from "./FullscreenChartModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { subMonths, startOfDay, endOfDay } from "date-fns";

// Session storage keys
const SESSION_KEY_PRESET = "stats_timeRange_preset";
const SESSION_KEY_CUSTOM_START = "stats_timeRange_customStart";
const SESSION_KEY_CUSTOM_END = "stats_timeRange_customEnd";

const VALID_PRESETS: TimeRangePreset[] = ["1m", "3m", "6m", "12m", "all", "custom"];

function getInitialTimeRange(): TimeRangePreset {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY_PRESET);
    if (stored && VALID_PRESETS.includes(stored as TimeRangePreset)) {
      return stored as TimeRangePreset;
    }
  } catch {
    // sessionStorage not available
  }
  return "3m"; // Default
}

function getInitialCustomDates(): { start: string; end: string } {
  try {
    const start = sessionStorage.getItem(SESSION_KEY_CUSTOM_START) || "";
    const end = sessionStorage.getItem(SESSION_KEY_CUSTOM_END) || "";
    return { start, end };
  } catch {
    return { start: "", end: "" };
  }
}

interface AnalysisViewProps {
  onBack: () => void;
  onNavigateToLimits?: () => void;
}

export function AnalysisView({ onBack, onNavigateToLimits }: AnalysisViewProps) {
  const isMobile = useIsMobile();
  
  // Initialize from sessionStorage
  const [timeRange, setTimeRange] = useState<TimeRangePreset>(getInitialTimeRange);
  const initialCustom = getInitialCustomDates();
  const [customFrom, setCustomFrom] = useState(initialCustom.start);
  const [customTo, setCustomTo] = useState(initialCustom.end);
  const [firstEntryDate, setFirstEntryDate] = useState<string | null>(null);
  
  // View mode for tabs
  const [viewMode, setViewMode] = useState<"statistik" | "ki-muster">("statistik");
  
  // Fullscreen modals
  const [timeDistributionFullscreen, setTimeDistributionFullscreen] = useState(false);
  const [timeSeriesFullscreen, setTimeSeriesFullscreen] = useState(false);

  // Persist timeRange to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY_PRESET, timeRange);
    } catch {
      // sessionStorage not available
    }
  }, [timeRange]);

  // Persist custom dates to sessionStorage
  useEffect(() => {
    try {
      if (timeRange === "custom") {
        sessionStorage.setItem(SESSION_KEY_CUSTOM_START, customFrom);
        sessionStorage.setItem(SESSION_KEY_CUSTOM_END, customTo);
      }
    } catch {
      // sessionStorage not available
    }
  }, [timeRange, customFrom, customTo]);

  // Handle time range change with smart defaults for custom range
  const handleTimeRangeChange = (newRange: TimeRangePreset) => {
    if (newRange === "custom") {
      // Set sensible defaults: end = today, start = today - 3 months
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      setCustomTo(today);
      setCustomFrom(threeMonthsAgo.toISOString().split('T')[0]);
    }
    setTimeRange(newRange);
  };

  // Load entries for the "alle" option calculation (limited for performance)
  const entriesLimit = timeRange === "all" ? 5000 : 1000;
  const { data: allEntries = [], isLoading: entriesLoading, error: entriesError, refetch } = useEntries({ limit: entriesLimit });

  // Lade das Datum des ersten Eintrags für "Alle"-Option
  useEffect(() => {
    async function loadFirstEntry() {
      const { getFirstEntryDate } = await import("@/features/entries/api/entries.api");
      const date = await getFirstEntryDate();
      setFirstEntryDate(date);
    }
    if (timeRange === "all") {
      loadFirstEntry();
    }
  }, [timeRange]);

  const { from, to } = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    if (timeRange === "custom") {
      if (customFrom && customTo) {
        return { from: customFrom, to: customTo };
      }
      // Fallback if custom selected but no dates
      const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return {
        from: from.toISOString().split('T')[0],
        to: today
      };
    }
    
    // "Alle" Option - vom ersten Eintrag bis heute
    if (timeRange === "all") {
      // Falls noch kein firstEntryDate geladen: 5 Jahre zurück als Fallback
      const fallbackFrom = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
      return {
        from: firstEntryDate || fallbackFrom.toISOString().split('T')[0],
        to: today
      };
    }
    
    // Calculate months based on preset
    const monthsMap: Record<string, number> = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 };
    const months = monthsMap[timeRange] || 3;
    
    // Use date-fns for robust month calculation
    const fromDate = startOfDay(subMonths(now, months));
    const toDate = endOfDay(now);
    
    return {
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0]
    };
  }, [timeRange, customFrom, customTo, firstEntryDate]);

  // Use the same entries data for consistency
  const entries = allEntries;

  // Filter entries based on date range
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const entryDate = entry.selected_date || entry.timestamp_created?.split('T')[0];
      if (!entryDate) return false;
      return entryDate >= from && entryDate <= to;
    });
  }, [entries, from, to]);

  // Fetch additional data for pattern statistics
  const entryIds = useMemo(() => filteredEntries.map(e => Number(e.id)), [filteredEntries]);
  const { data: medicationEffectsData = [] } = useMedicationEffectsForEntries(entryIds);
  const { data: medicationLimits = [] } = useMedicationLimits();

  // Build entry symptoms - currently empty, would need entry_symptoms table query
  const entrySymptoms: EntrySymptom[] = useMemo(() => {
    return [];
  }, []);

  // Compute pattern statistics
  // Pass allEntries for correct rolling 30-day limit calculation
  const patternStats = useMemo(() => {
    return computeStatistics(
      filteredEntries,
      medicationEffectsData as MedicationEffect[],
      entrySymptoms,
      medicationLimits as MedicationLimit[],
      entries // All entries for rolling 30-day calculation
    );
  }, [filteredEntries, medicationEffectsData, entrySymptoms, medicationLimits, entries]);

  const { data: timeDistribution = [] } = useTimeDistribution({ from, to });

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Auswertung & Statistiken</h1>
        </div>

        {/* Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "statistik" | "ki-muster")} className="mb-6">
          <TabsList className="grid w-full grid-cols-2 h-14">
            <TabsTrigger value="statistik" className="flex items-center gap-2 text-base px-6 py-3">
              <BarChart3 className="h-5 w-5" />
              Statistik
            </TabsTrigger>
            <TabsTrigger value="ki-muster" className="flex items-center gap-2 text-base px-6 py-3">
              <Brain className="h-5 w-5" />
              KI-Muster
            </TabsTrigger>
          </TabsList>

          <TabsContent value="statistik" className="mt-6">
            {/* Time Range Selection */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Filter & Zeitraum</CardTitle>
                <p className="text-sm text-muted-foreground">Zeitraum</p>
              </CardHeader>
              <CardContent>
                <TimeRangeButtons 
                  value={timeRange}
                  onChange={handleTimeRangeChange}
                />
                {timeRange === "custom" && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="text-sm font-medium">Von</label>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Bis</label>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Loading State */}
            {entriesLoading && (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}

            {/* Error State */}
            {entriesError && (
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h3 className="text-lg font-semibold mb-2">Fehler beim Laden</h3>
                <p className="text-muted-foreground mb-4">Die Daten konnten nicht geladen werden.</p>
                <Button onClick={() => refetch()} variant="outline">
                  Erneut versuchen
                </Button>
              </div>
            )}

            {/* Empty State */}
            {!entriesLoading && filteredEntries.length === 0 && !entriesError && (
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Keine Einträge vorhanden</h3>
                <p className="text-muted-foreground">Im ausgewählten Zeitraum gibt es keine Migräne-Einträge.</p>
              </div>
            )}

            {/* Pattern Cards */}
            {!entriesLoading && filteredEntries.length > 0 && (
              <>
                <PatternCards statistics={patternStats} isLoading={entriesLoading} />

                {onNavigateToLimits && (
                  <Card className="border-primary/20 bg-primary/5 mb-6">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium mb-1">Medikamenten-Übergebrauch im Blick</h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            Überwache deine Medikamenteneinnahme und vermeide Überkonsum durch individuelle Limits.
                          </p>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={onNavigateToLimits}
                            className="w-full sm:w-auto"
                          >
                            📊 Zur Limits-Übersicht
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Time Distribution Chart */}
                <Card className="mb-6">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Tageszeit-Verteilung</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Anzahl Migräne-Episoden nach Tageszeit
                      </p>
                    </div>
                    <FullscreenChartButton onClick={() => setTimeDistributionFullscreen(true)} />
                  </CardHeader>
                  <CardContent>
                    <TimeDistributionChart data={timeDistribution} />
                  </CardContent>
                </Card>

                {/* Time Series Chart */}
                <Card className="mb-6">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Schmerz- & Wetterverlauf</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Zeitlicher Verlauf von Schmerzintensität, Temperatur und Luftdruck
                      </p>
                    </div>
                    <FullscreenChartButton onClick={() => setTimeSeriesFullscreen(true)} />
                  </CardHeader>
                  <CardContent>
                    <TimeSeriesChart 
                      entries={filteredEntries}
                      dateRange={{ from, to }}
                    />
                  </CardContent>
                </Card>

                {/* Hint to AI Tab */}
                <Card 
                  className="mb-6 border-primary/20 bg-primary/5"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Brain className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium mb-1">Noch mehr Zusammenhänge sehen?</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Im Tab <strong>"KI-Muster"</strong> analysiert die KI deine Voice-Notizen, Eintragsnotizen, Symptome, Wetterdaten und Medikamente, um mögliche Trigger und Zusammenhänge zu erkennen.
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setViewMode("ki-muster")}
                          className="w-full sm:w-auto"
                        >
                          <Brain className="h-4 w-4 mr-2" />
                          Zur KI-Muster-Analyse
                        </Button>
                        <p className="text-xs text-muted-foreground mt-3">
                          Diese KI-basierte Analyse dient als Orientierungshilfe und ersetzt keine ärztliche Diagnose.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="ki-muster" className="mt-6">
            <VoiceNotesAIAnalysis />
        </TabsContent>
      </Tabs>
      </div>

      {/* Fullscreen Modals */}
      <FullscreenChartModal
          open={timeDistributionFullscreen}
          onOpenChange={setTimeDistributionFullscreen}
          title="Tageszeit-Verteilung"
        >
          <TimeDistributionChart data={timeDistribution} />
        </FullscreenChartModal>

        <FullscreenChartModal
          open={timeSeriesFullscreen}
          onOpenChange={setTimeSeriesFullscreen}
          title="Schmerz- & Wetterverlauf"
        >
          <TimeSeriesChart 
            entries={filteredEntries}
            dateRange={{ from, to }}
          />
        </FullscreenChartModal>
    </div>
  );
}
