import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Brain, AlertTriangle, Clock } from "lucide-react";
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
import { FullscreenChartModal, FullscreenChartButton } from "./FullscreenChartModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeDateRange } from "@/lib/dateRange";
import { useUserDefaults } from "@/features/settings/hooks/useUserSettings";
import type { AIReport } from "@/features/ai-reports";
import { computeDiaryDayBuckets } from "@/lib/diary/dayBuckets";
import { HeadacheDaysPie } from "@/components/diary/HeadacheDaysPie";

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
  } catch { /* noop */ }
  return "3m";
}

function getInitialCustomDates(): { start: string; end: string } {
  try {
    return {
      start: sessionStorage.getItem(SESSION_KEY_CUSTOM_START) || "",
      end: sessionStorage.getItem(SESSION_KEY_CUSTOM_END) || "",
    };
  } catch {
    return { start: "", end: "" };
  }
}

interface AnalysisViewProps {
  onBack: () => void;
  onNavigateToLimits?: () => void;
  onViewAIReport?: (report: AIReport) => void;
}

export function AnalysisView({ onBack, onNavigateToLimits, onViewAIReport }: AnalysisViewProps) {
  // Time range state
  const [timeRange, setTimeRange] = useState<TimeRangePreset>(getInitialTimeRange);
  const initialCustom = getInitialCustomDates();
  const [customFrom, setCustomFrom] = useState(initialCustom.start);
  const [customTo, setCustomTo] = useState(initialCustom.end);
  const [firstEntryDate, setFirstEntryDate] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"statistik" | "ki-analyse">("statistik");

  // Fullscreen modals
  const [timeDistributionFullscreen, setTimeDistributionFullscreen] = useState(false);
  const [timeSeriesFullscreen, setTimeSeriesFullscreen] = useState(false);

  // User settings
  const { data: userDefaults } = useUserDefaults();
  const warningThreshold = userDefaults?.medication_limit_warning_threshold_pct ?? 80;

  // Persist timeRange
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY_PRESET, timeRange); } catch { /* noop */ }
  }, [timeRange]);

  useEffect(() => {
    try {
      if (timeRange === "custom") {
        sessionStorage.setItem(SESSION_KEY_CUSTOM_START, customFrom);
        sessionStorage.setItem(SESSION_KEY_CUSTOM_END, customTo);
      }
    } catch { /* noop */ }
  }, [timeRange, customFrom, customTo]);

  const handleTimeRangeChange = (newRange: TimeRangePreset) => {
    if (newRange === "custom") {
      const now = new Date();
      setCustomTo(now.toISOString().split('T')[0]);
      setCustomFrom(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split('T')[0]);
    }
    setTimeRange(newRange);
  };

  // Entries
  const entriesLimit = timeRange === "all" ? 5000 : 1000;
  const { data: allEntries = [], isLoading: entriesLoading, error: entriesError, refetch } = useEntries({ limit: entriesLimit });

  useEffect(() => {
    if (timeRange === "all") {
      import("@/features/entries/api/entries.api").then(m => m.getFirstEntryDate()).then(setFirstEntryDate);
    }
  }, [timeRange]);

  const { from, to } = useMemo(() => computeDateRange(timeRange, { customFrom, customTo, firstEntryDate }), [timeRange, customFrom, customTo, firstEntryDate]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter(entry => {
      const d = entry.selected_date || entry.timestamp_created?.split('T')[0];
      return d && d >= from && d <= to;
    });
  }, [allEntries, from, to]);

  // Pattern stats
  const entryIds = useMemo(() => filteredEntries.map(e => Number(e.id)), [filteredEntries]);
  const { data: medicationEffectsData = [] } = useMedicationEffectsForEntries(entryIds);
  const { data: medicationLimits = [] } = useMedicationLimits();
  const entrySymptoms: EntrySymptom[] = useMemo(() => [], []);

  const patternStats = useMemo(() => {
    return computeStatistics(
      filteredEntries,
      medicationEffectsData as MedicationEffect[],
      entrySymptoms,
      medicationLimits as MedicationLimit[],
      allEntries
    );
  }, [filteredEntries, medicationEffectsData, entrySymptoms, medicationLimits, allEntries]);

  const daysInRange = useMemo(() => {
    if (!from || !to) return undefined;
    return Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
  }, [from, to]);

  const dayBuckets = useMemo(() => computeDiaryDayBuckets({ startDate: from, endDate: to, entries: filteredEntries }), [from, to, filteredEntries]);

  const hasOveruseWarning = useMemo(() => {
    return patternStats.medicationAndEffect.topMedications.some(med => {
      if (!med.limitInfo) return false;
      const pct = (med.limitInfo.rolling30Count / med.limitInfo.limit) * 100;
      return pct >= warningThreshold || med.limitInfo.isOverLimit;
    });
  }, [patternStats, warningThreshold]);

  const medicationsWithWarning = useMemo(() => {
    return patternStats.medicationAndEffect.topMedications.filter(med => {
      if (!med.limitInfo) return false;
      const pct = (med.limitInfo.rolling30Count / med.limitInfo.limit) * 100;
      return pct >= warningThreshold || med.limitInfo.isOverLimit;
    });
  }, [patternStats, warningThreshold]);

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
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "statistik" | "ki-analyse")} className="mb-6">
          <TabsList className="grid w-full grid-cols-2 h-14">
            <TabsTrigger value="statistik" className="flex items-center gap-2 text-base px-6 py-3">
              <BarChart3 className="h-5 w-5" />
              Statistik
            </TabsTrigger>
            <TabsTrigger value="ki-analyse" className="flex items-center gap-2 text-base px-6 py-3">
              <Brain className="h-5 w-5" />
              KI-Analyse
            </TabsTrigger>
          </TabsList>

          {viewMode === "statistik" && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              Automatische Auswertung deiner Einträge in Echtzeit
            </p>
          )}

          <TabsContent value="statistik" className="mt-6">
            {/* Time Range */}
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Zeitraum</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <TimeRangeButtons value={timeRange} onChange={handleTimeRangeChange} />
                {timeRange === "custom" && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="text-sm font-medium">Von</label>
                      <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Bis</label>
                      <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pie Chart */}
            {!entriesLoading && filteredEntries.length > 0 && (
              <Card className="mb-6 p-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Tagesverteilung</h3>
                <HeadacheDaysPie
                  totalDays={dayBuckets.totalDays}
                  painFreeDays={dayBuckets.painFreeDays}
                  painDaysNoTriptan={dayBuckets.painDaysNoTriptan}
                  triptanDays={dayBuckets.triptanDays}
                />
              </Card>
            )}

            {/* Loading */}
            {entriesLoading && (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}

            {/* Error */}
            {entriesError && (
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h3 className="text-lg font-semibold mb-2">Fehler beim Laden</h3>
                <p className="text-muted-foreground mb-4">Die Daten konnten nicht geladen werden.</p>
                <Button onClick={() => refetch()} variant="outline">Erneut versuchen</Button>
              </div>
            )}

            {/* Empty */}
            {!entriesLoading && filteredEntries.length === 0 && !entriesError && (
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Keine Einträge vorhanden</h3>
                <p className="text-muted-foreground">Im ausgewählten Zeitraum gibt es keine Migräne-Einträge.</p>
              </div>
            )}

            {/* Data sections – new order per TEIL 2 */}
            {!entriesLoading && filteredEntries.length > 0 && (
              <>
                {/* 1. Tageszeit-Verteilung */}
                <Card className="mb-6">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" />
                        Tageszeit-Verteilung
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">Anzahl Migräne-Episoden nach Uhrzeit</p>
                    </div>
                    <FullscreenChartButton onClick={() => setTimeDistributionFullscreen(true)} />
                  </CardHeader>
                  <CardContent>
                    <TimeDistributionChart data={timeDistribution} />
                  </CardContent>
                </Card>

                {/* 2–4. PatternCards: Medikamente, Schmerzprofil, Lokalisation */}
                <PatternCards
                  statistics={patternStats}
                  isLoading={entriesLoading}
                  daysInRange={daysInRange}
                  overuseInfo={{
                    hasWarning: hasOveruseWarning,
                    medicationsWithWarning,
                    onNavigateToLimits,
                    warningThreshold
                  }}
                />

                {/* 5. Schmerz- & Wetterverlauf */}
                <Card className="mb-6">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">Schmerz- & Wetterverlauf</CardTitle>
                    <FullscreenChartButton onClick={() => setTimeSeriesFullscreen(true)} />
                  </CardHeader>
                  <CardContent>
                    <TimeSeriesChart entries={filteredEntries} dateRange={{ from, to }} />
                  </CardContent>
                </Card>

                {/* 6. Hint to KI tab */}
                <Card className="mb-6 border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Brain className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium mb-1">Tiefere Analyse?</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Im Tab <strong>„KI-Analyse"</strong> erstellt die KI einen detaillierten Bericht über mögliche Muster und Trigger.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => setViewMode("ki-analyse")}>
                          <Brain className="h-4 w-4 mr-2" />
                          KI-Analysebericht
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="ki-analyse" className="mt-6">
            <VoiceNotesAIAnalysis onViewReport={onViewAIReport} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Fullscreen Modals */}
      <FullscreenChartModal
        open={timeDistributionFullscreen}
        onOpenChange={setTimeDistributionFullscreen}
        title="Tageszeit-Verteilung"
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
      >
        <TimeDistributionChart data={timeDistribution} />
      </FullscreenChartModal>

      <FullscreenChartModal
        open={timeSeriesFullscreen}
        onOpenChange={setTimeSeriesFullscreen}
        title="Schmerz- & Wetterverlauf"
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
      >
        <TimeSeriesChart entries={filteredEntries} dateRange={{ from, to }} />
      </FullscreenChartModal>
    </div>
  );
}
