import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { BarChart3, Brain, AlertTriangle, Clock } from "lucide-react";
import { AppHeader } from "@/components/ui/app-header";
import { TimeRangeSelector } from "./TimeRangeSelector";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PatternCards } from "./PatternCards";
import { TimeDistributionChart } from "./TimeDistributionChart";
import { AccompanyingSymptomsCard } from "./AccompanyingSymptomsCard";
import { MeCfsStatisticsCard } from "./MeCfsStatisticsCard";
import { MeCfsCorrelationCard } from "./MeCfsCorrelationCard";
import { VoiceNotesAIAnalysis } from "./VoiceNotesAIAnalysis";
import { MedicationOverviewCard } from "./MedicationOverviewCard";
import { WeatherAssociationCard } from "./WeatherAssociationCard";
import { useTimeDistribution } from "@/features/statistics/hooks/useStatistics";
import { useMedicationEffectsForEntries } from "@/features/medication-effects/hooks/useMedicationEffects";
import { useMedicationLimits } from "@/features/medication-limits/hooks/useMedicationLimits";
import { computeStatistics } from "@/lib/statistics";
import type { MedicationEffect, MedicationLimit, EntrySymptom } from "@/lib/statistics";
import { FullscreenChartModal, FullscreenChartButton } from "./FullscreenChartModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserDefaults } from "@/features/settings/hooks/useUserSettings";
import type { AIReport } from "@/features/ai-reports";
import { useHeadacheTreatmentDays } from '@/lib/analytics/headacheDays';
import { buildAppAnalysisReport } from "@/lib/report-v2/adapters/buildAppAnalysisReport";
import { HeadacheDaysPie } from "@/components/diary/HeadacheDaysPie";
import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useSymptomBurdens } from "@/features/symptoms/hooks/useSymptomBurden";
import { getMeCfsTrackingStartDate, filterEntriesForMeCfs } from "@/lib/mecfs/trackingStart";
import { getDocumentedDays } from "@/lib/dateRange/rangeResolver";
import { useTimeRange } from "@/contexts/TimeRangeContext";
import { buildWeatherDayFeatures } from "@/lib/report-v2/adapters/buildWeatherDayFeatures";
import { computeWeatherAssociation } from "@/lib/report-v2/adapters/weatherAssociationBrowser";

/** Fetch entry_symptoms with symptom names for a set of entry IDs */
function useEntrySymptomsBulk(entryIds: number[]) {
  return useQuery({
    queryKey: ['entry-symptoms-bulk', entryIds],
    queryFn: async () => {
      if (entryIds.length === 0) return [];
      const chunkSize = 200;
      const results: EntrySymptom[] = [];
      for (let i = 0; i < entryIds.length; i += chunkSize) {
        const chunk = entryIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('entry_symptoms')
          .select('entry_id, symptom_id, symptom_catalog(name)')
          .in('entry_id', chunk);
        if (error) throw error;
        if (data) {
          for (const row of data) {
            results.push({
              entry_id: row.entry_id,
              symptom_id: row.symptom_id,
              symptom_name: (row as any).symptom_catalog?.name || undefined,
            });
          }
        }
      }
      return results;
    },
    enabled: entryIds.length > 0,
    staleTime: 60_000,
  });
}

interface AnalysisViewProps {
  onBack: () => void;
  onNavigateToLimits?: () => void;
  onNavigateToBurden?: () => void;
  onNavigateToMedicationHistory?: (medicationName: string, rangeOverride?: { preset: string; from?: string; to?: string }) => void;
  onViewAIReport?: (report: AIReport) => void;
}

export function AnalysisView({ onBack, onNavigateToLimits, onNavigateToBurden, onNavigateToMedicationHistory, onViewAIReport }: AnalysisViewProps) {
  // Global time range (Single Source of Truth)
  const { timeRange, setTimeRange, from, to, wasClamped, firstEntryDate, documentationSpanDays } = useTimeRange();

  // View mode
  const [viewMode, setViewMode] = useState<"statistik" | "ki-analyse">("statistik");

  // ME/CFS tracking start date
  const [mecfsStartDate, setMecfsStartDate] = useState<string | null>(null);
  useEffect(() => {
    getMeCfsTrackingStartDate().then(setMecfsStartDate);
  }, []);

  // Fullscreen modals
  const [pieFullscreen, setPieFullscreen] = useState(false);
  const [timeDistributionFullscreen, setTimeDistributionFullscreen] = useState(false);
  const [timeSeriesFullscreen, setTimeSeriesFullscreen] = useState(false);

  // User settings
  const { data: userDefaults } = useUserDefaults();

  // Entries
  const entriesLimit = timeRange === "all" ? 5000 : 1000;
  const { data: allEntries = [], isLoading: entriesLoading, error: entriesError, refetch } = useEntries({ limit: entriesLimit });

  const filteredEntries = useMemo(() => {
    return allEntries.filter(entry => {
      const d = entry.selected_date || entry.timestamp_created?.split('T')[0];
      return d && d >= from && d <= to;
    });
  }, [allEntries, from, to]);

  // Documented days (for denominator)
  const documentedDaysSet = useMemo(
    () => getDocumentedDays(filteredEntries, from, to),
    [filteredEntries, from, to]
  );
  const documentedDaysCount = documentedDaysSet.size;

  // Pattern stats
  const entryIds = useMemo(() => filteredEntries.map(e => Number(e.id)), [filteredEntries]);
  const { data: medicationEffectsData = [] } = useMedicationEffectsForEntries(entryIds);
  const { data: medicationLimits = [] } = useMedicationLimits();
  
  const { data: entrySymptoms = [] } = useEntrySymptomsBulk(entryIds);
  
  // Burden data
  const { data: burdenData = [] } = useSymptomBurdens();
  const burdenMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of burdenData) m.set(b.symptom_key, b.burden_level);
    return m;
  }, [burdenData]);

  const patternStats = useMemo(() => {
    return computeStatistics(
      filteredEntries,
      medicationEffectsData as MedicationEffect[],
      entrySymptoms as EntrySymptom[],
      medicationLimits as MedicationLimit[],
      allEntries
    );
  }, [filteredEntries, medicationEffectsData, entrySymptoms, medicationLimits, allEntries]);

  // Begleitsymptome stats
  const symptomStats = useMemo(() => {
    if (entrySymptoms.length === 0) return { symptoms: [], episodesWithSymptoms: 0, checkedEpisodes: 0, checkedSymptoms: [] as { name: string; count: number; percentage: number }[] };
    
    const entriesWithSymptoms = new Set(entrySymptoms.map(es => es.entry_id));
    const episodesWithSymptoms = entriesWithSymptoms.size;
    const totalEpisodes = filteredEntries.length;
    
    const counts = new Map<string, number>();
    for (const es of entrySymptoms) {
      const name = es.symptom_name || es.symptom_id;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const symptoms = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, percentage: totalEpisodes > 0 ? Math.round((count / totalEpisodes) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
    
    const checkedEntryIds = new Set(
      filteredEntries
        .filter((e: any) => e.symptoms_state === 'viewed' || e.symptoms_state === 'edited')
        .map(e => Number(e.id))
    );
    const checkedEpisodes = checkedEntryIds.size;
    
    const checkedCounts = new Map<string, number>();
    for (const es of entrySymptoms) {
      if (checkedEntryIds.has(es.entry_id)) {
        const name = es.symptom_name || es.symptom_id;
        checkedCounts.set(name, (checkedCounts.get(name) || 0) + 1);
      }
    }
    const checkedSymptoms = Array.from(checkedCounts.entries())
      .map(([name, count]) => ({ name, count, percentage: checkedEpisodes > 0 ? Math.round((count / checkedEpisodes) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
    
    return { symptoms, episodesWithSymptoms, checkedEpisodes, checkedSymptoms };
  }, [entrySymptoms, filteredEntries]);

  // SSOT: Headache & Treatment Days (central hook)
  const { data: dayBuckets } = useHeadacheTreatmentDays();
  const daysInRange = dayBuckets?.totalDays ?? 0;

  // ─── Weather Logs for Association ─────────────────────────────────
  const { data: weatherLogs = [] } = useQuery({
    queryKey: ['weather-logs-for-analysis', from, to],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];

      // Paginated fetch — no limit(1000) truncation
      const allLogs: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('weather_logs')
          .select('id, snapshot_date, requested_at, pressure_mb, pressure_change_24h, temperature_c, humidity')
          .eq('user_id', userData.user.id)
          .gte('snapshot_date', from)
          .lte('snapshot_date', to)
          .order('snapshot_date', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data) allLogs.push(...data);
        hasMore = (data?.length ?? 0) === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      return allLogs;
    },
    staleTime: 120_000,
  });

  // ─── SSOT Report (V2) ─────────────────────────────────────────────
  const ssotReport = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    const { report } = buildAppAnalysisReport({
      range: {
        startISO: from,
        endISO: to,
        timezone: 'Europe/Berlin',
        mode: timeRange === '1m' ? 'LAST_30_DAYS' : timeRange === 'custom' ? 'CUSTOM' : 'CALENDAR_MONTH',
        totalDaysInRange: daysInRange,
      },
      painEntries: filteredEntries as any[],
      medicationEffects: medicationEffectsData as any[],
    });
    return report;
  }, [filteredEntries, from, to, timeRange, medicationEffectsData, daysInRange]);

  // ─── Weather Association (deterministic, SSOT) ─────────────────────
  const weatherAnalysis = useMemo(() => {
    if (!ssotReport || ssotReport.raw.countsByDay.length === 0) return null;

    const { features, coverageCounts } = buildWeatherDayFeatures(
      {
        countsByDay: ssotReport.raw.countsByDay,
        entries: filteredEntries as any[],
        weatherLogs: weatherLogs as any[],
      },
      true
    );

    if (features.length === 0) return null;
    return computeWeatherAssociation(features, { coverageCounts });
  }, [ssotReport, filteredEntries, weatherLogs]);

  const hasOveruseWarning = useMemo(() => {
    return patternStats.medicationAndEffect.topMedications.some(med => {
      if (!med.limitInfo) return false;
      // Fixed threshold: warning at limit-1, reached at limit, exceeded above
      return med.limitInfo.rolling30Count >= med.limitInfo.limit - 1;
    });
  }, [patternStats]);

  const medicationsWithWarning = useMemo(() => {
    return patternStats.medicationAndEffect.topMedications.filter(med => {
      if (!med.limitInfo) return false;
      return med.limitInfo.rolling30Count >= med.limitInfo.limit - 1;
    });
  }, [patternStats]);

  const { data: timeDistribution = [] } = useTimeDistribution({ from, to });


  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Auswertung & Statistiken" onBack={onBack} sticky />
      <div className="max-w-4xl mx-auto p-4">

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
                <TimeRangeSelector />
              </CardContent>
            </Card>

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

            {/* Data sections */}
            {!entriesLoading && filteredEntries.length > 0 && (
              <div className="space-y-6">
                {/* 1. Kopfschmerz- & Behandlungstage (Kreisdiagramm) */}
                <Card className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-1">Kopfschmerz- & Behandlungstage</h3>
                      <p className="text-xs text-muted-foreground">
                        Verteilung der {dayBuckets?.totalDays ?? 0} Kalendertage
                      </p>
                    </div>
                    <FullscreenChartButton onClick={() => setPieFullscreen(true)} />
                  </div>
                  <HeadacheDaysPie
                    totalDays={dayBuckets?.totalDays ?? 0}
                    painFreeDays={dayBuckets?.painFreeDays ?? 0}
                    painDaysNoTriptan={dayBuckets?.painDaysNoTriptan ?? 0}
                    triptanDays={dayBuckets?.triptanDays ?? 0}
                    reportLegacySegments={ssotReport?.charts.legacyHeadacheDaysPie?.segments}
                  />
                </Card>

                {/* 2. Schmerzintensität + 3. Begleitsymptome + 5. Medikamente + 4. Lokalisation */}
                <PatternCards
                  statistics={patternStats}
                  isLoading={entriesLoading}
                  daysInRange={daysInRange}
                  reportKpis={ssotReport?.kpis}
                  overuseInfo={{
                    hasWarning: hasOveruseWarning,
                    medicationsWithWarning,
                    onNavigateToLimits,
                  }}
                />

                {/* Medikamenten-Übersicht (7/30 Tage + Limit + Deep-Link) */}
                <MedicationOverviewCard
                  onNavigateToMedicationHistory={onNavigateToMedicationHistory}
                />

                {/* 3. Begleitsymptome */}
                <AccompanyingSymptomsCard
                  symptoms={symptomStats.symptoms}
                  totalEpisodes={filteredEntries.length}
                  episodesWithSymptoms={symptomStats.episodesWithSymptoms}
                  checkedEpisodes={symptomStats.checkedEpisodes}
                  checkedSymptoms={symptomStats.checkedSymptoms}
                  burdenMap={burdenMap}
                  onNavigateToBurden={onNavigateToBurden}
                />

                {/* 4. Tageszeit-Verteilung */}
                <Card>
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

                {/* 6.5 Wetter & Kopfschmerz (deterministic) */}
                {weatherAnalysis && (
                  <WeatherAssociationCard
                    coverage={weatherAnalysis.coverage}
                    pressureDelta24h={weatherAnalysis.pressureDelta24h}
                    disclaimer={weatherAnalysis.disclaimer}
                  />
                )}

                {/* 7. Schmerz- & Wetterverlauf */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">Schmerz- & Wetterverlauf</CardTitle>
                    <FullscreenChartButton onClick={() => setTimeSeriesFullscreen(true)} />
                  </CardHeader>
                  <CardContent>
                    <TimeSeriesChart entries={filteredEntries} dateRange={{ from, to }} />
                  </CardContent>
                </Card>

                {/* ME/CFS-Belastung */}
                {(() => {
                  const mecfsStart = mecfsStartDate ? (mecfsStartDate > from ? mecfsStartDate : from) : null;
                  const mecfsEnd = to;
                  const mecfsEntries = filterEntriesForMeCfs(filteredEntries, mecfsStartDate);
                  return (
                    <>
                      <MeCfsStatisticsCard entries={mecfsEntries} mecfsStart={mecfsStart} mecfsEnd={mecfsEnd} />
                      <MeCfsCorrelationCard entries={mecfsEntries} />
                    </>
                  );
                })()}

                {/* 7. Hint to KI tab */}
                <Card className="border-primary/20 bg-primary/5">
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
              </div>
            )}
          </TabsContent>

          <TabsContent value="ki-analyse" className="mt-6">
            <VoiceNotesAIAnalysis onViewReport={onViewAIReport} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Fullscreen Modals */}
      <FullscreenChartModal
        open={pieFullscreen}
        onOpenChange={setPieFullscreen}
        title="Kopfschmerz- & Behandlungstage"
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      >
        <div className="flex items-center justify-center h-full">
          <HeadacheDaysPie
            totalDays={dayBuckets?.totalDays ?? 0}
            painFreeDays={dayBuckets?.painFreeDays ?? 0}
            painDaysNoTriptan={dayBuckets?.painDaysNoTriptan ?? 0}
            triptanDays={dayBuckets?.triptanDays ?? 0}
            reportLegacySegments={ssotReport?.charts.legacyHeadacheDaysPie?.segments}
            fullscreen
          />
        </div>
      </FullscreenChartModal>

      <FullscreenChartModal
        open={timeDistributionFullscreen}
        onOpenChange={setTimeDistributionFullscreen}
        title="Tageszeit-Verteilung"
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      >
        <div className="h-full min-h-[400px]">
          <TimeDistributionChart data={timeDistribution} />
        </div>
      </FullscreenChartModal>

      <FullscreenChartModal
        open={timeSeriesFullscreen}
        onOpenChange={setTimeSeriesFullscreen}
        title="Schmerz- & Wetterverlauf"
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      >
        <div className="h-full min-h-[400px]">
          <TimeSeriesChart entries={filteredEntries} dateRange={{ from, to }} />
        </div>
      </FullscreenChartModal>
    </div>
  );
}
