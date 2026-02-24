import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { computeDiaryDayBuckets } from "@/lib/diary/dayBuckets";
import { HeadacheDaysPie } from "@/components/diary/HeadacheDaysPie";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PainEntry } from "@/types/painApp";

import { fetchAllEntriesForExport, countEntriesInRange } from "@/features/entries/api/entries.api";
import { buildDiaryPdf } from "@/lib/pdf/report";
import type { SymptomDataForPdf } from "@/lib/pdf/symptomSection";
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan";
import { mapTextLevelToScore } from "@/lib/utils/pain";
import { useMedicationEffectsForEntries } from "@/features/medication-effects/hooks/useMedicationEffects";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { Loader2, FileText, Brain } from "lucide-react";
import { AppHeader } from "@/components/ui/app-header";
import { format } from "date-fns";
import { toast } from "sonner";
import { TimeRangeSelector } from "./TimeRangeSelector";
import type { TimeRangePreset } from "./TimeRangeButtons";
import { useTimeRange } from "@/contexts/TimeRangeContext";
import { DoctorSelectionDialog, type Doctor } from "./DoctorSelectionDialog";
import { Switch } from "@/components/ui/switch";
import { devLog, devWarn } from "@/lib/utils/devLogger";
import { buildReportData, type ReportData, getEntryDate } from "@/lib/pdf/reportData";

import { PremiumBadge } from "@/components/ui/premium-badge";
import { useUserAISettings } from "@/features/draft-composer/hooks/useUserAISettings";
import { useReportReminder, ReportReminderDialog } from "@/features/diary/preflight";
import { useDiaryReportQuota } from "@/features/ai-reports/hooks/useDiaryReportQuota";

// Premium AI Report Response Type
interface PremiumAIReportResult {
  schemaVersion: number;
  timeRange: { from: string; to: string };
  dataCoverage: {
    entries: number;
    notes: number;
    weatherDays: number;
    medDays: number;
  };
  headline: string;
  disclaimer: string;
  keyFindings: Array<{
    title: string;
    finding: string;
    evidence: string;
  }>;
  sections: Array<{
    title: string;
    bullets: string[];
  }>;
  createdAt: string;
}

type Preset = TimeRangePreset;

// Legacy helpers removed — now uses global useTimeRange()

function mapEffectToNumber(rating: string): number {
  const map: Record<string, number> = {
    'none': 0,
    'poor': 2.5,
    'moderate': 5,
    'good': 7.5,
    'very_good': 10
  };
  return map[rating] || 0;
}

// Privacy is decided at entry level.
// Private notes are never included in exports or sharing.
// Sharing is one-click and frictionless.
// No runtime privacy decisions during sharing.

// Simplified settings – stats, analysis, meds, therapies always included
interface ReportSettingsState {
  preset: Preset;
  customStart: string;
  customEnd: string;
  includeEntriesList: boolean;
  includeDoctorData: boolean;
  includeNotes: boolean;
  lastDoctorIds: string[];
}

const DEFAULT_SETTINGS: Omit<ReportSettingsState, 'customStart' | 'customEnd'> = {
  preset: "3m",
  includeEntriesList: true,
  includeDoctorData: true,
  includeNotes: true,
  lastDoctorIds: [],
};

export default function DiaryReport({ onBack, onNavigate }: { onBack: () => void; onNavigate?: (target: string) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  // Global time range (SSOT)
  const { timeRange: preset, setTimeRange: setPreset, from, to, customFrom: customStart, customTo: customEnd, setCustomFrom: setCustomStart, setCustomTo: setCustomEnd } = useTimeRange();
  
  // Simplified toggles – stats, analysis, meds, therapies are ALWAYS included
  const [includeEntriesList, setIncludeEntriesList] = useState<boolean>(true);
  
  // Notes (only non-private notes; private notes are NEVER exported)
  const [includeNotes, setIncludeNotes] = useState<boolean>(true);
  const [includeDoctorData, setIncludeDoctorData] = useState<boolean>(true);
  
  // Doctor selection
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([]);
  const [doctorPreferencesLoaded, setDoctorPreferencesLoaded] = useState(false);
  
  // UI state
  const [userEmail, setUserEmail] = useState<string>("");
  const [analysisReport, setAnalysisReport] = useState<string>("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isGeneratingMedPlan, setIsGeneratingMedPlan] = useState(false);
  const [isGeneratingAIReport, setIsGeneratingAIReport] = useState(false);
  const [showDoctorSelection, setShowDoctorSelection] = useState(false);
  
  // Navigation target after preflight wizard navigates to settings
  const [pendingNavigationTarget, setPendingNavigationTarget] = useState<'personal' | 'doctors' | null>(null);
  const [pendingPdfType, setPendingPdfType] = useState<"diary" | "medplan" | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  // Premium KI-Analysebericht State
  const [includePremiumAI, setIncludePremiumAI] = useState(false);
  const [premiumAIReport, setPremiumAIReport] = useState<any>(null);
  const [premiumAIError, setPremiumAIError] = useState<string | null>(null);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Frische Daten bei jedem Öffnen der Komponente laden
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["patient_data"] });
    queryClient.invalidateQueries({ queryKey: ["doctors"] });
  }, [queryClient]);
  
  const { data: patientData, refetch: refetchPatientData } = usePatientData();
  const { data: doctors = [], refetch: refetchDoctors } = useDoctors();
  const { data: medicationCourses = [] } = useMedicationCourses();
  
  // Quota for Premium AI
  const { data: quotaData, refetch: refetchQuota } = useDiaryReportQuota();
  const isQuotaExhausted = quotaData && !quotaData.isUnlimited && quotaData.remaining <= 0;
  const isAIDisabled = quotaData && !quotaData.aiEnabled;

  // Load user email
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setUserEmail(data.user.email);
      }
    });
  }, []);

  // Load report settings from database
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data: settings } = await supabase
          .from("user_report_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (settings) {
          if (settings.default_report_preset && ["1m","3m","6m","12m","all","custom"].includes(settings.default_report_preset)) {
            setPreset(settings.default_report_preset as Preset);
          }
          if (settings.include_entries_list !== null) setIncludeEntriesList(settings.include_entries_list);
          if (settings.include_doctor_data !== null) setIncludeDoctorData(settings.include_doctor_data);
          
          const s = settings as any;
          if (s.include_entry_notes !== undefined && s.include_entry_notes !== null) {
            setIncludeNotes(s.include_entry_notes);
          }
          if (settings.include_ai_analysis !== undefined && settings.include_ai_analysis !== null) {
            setIncludePremiumAI(settings.include_ai_analysis);
          }
          
          const lastDoctorIds = (settings as any).last_doctor_export_ids;
          if (Array.isArray(lastDoctorIds) && lastDoctorIds.length > 0) {
            setSelectedDoctorIds(lastDoctorIds);
          }
        }
        setSettingsLoaded(true);
        setDoctorPreferencesLoaded(true);
      } catch (error) {
        console.error("Error loading report settings:", error);
        setSettingsLoaded(true);
        setDoctorPreferencesLoaded(true);
      }
    })();
  }, []);

  // Initialize doctor selection when doctors load
  useEffect(() => {
    if (!doctorPreferencesLoaded || doctors.length === 0) return;
    
    if (selectedDoctorIds.length > 0) {
      const existingDoctorIds = doctors.map(d => d.id).filter(Boolean) as string[];
      const validSelectedIds = selectedDoctorIds.filter(id => existingDoctorIds.includes(id));
      
      if (validSelectedIds.length !== selectedDoctorIds.length) {
        setSelectedDoctorIds(validSelectedIds);
      }
    } else if (doctors.length > 0 && includeDoctorData) {
      setSelectedDoctorIds(doctors.map(d => d.id).filter(Boolean) as string[]);
    }
  }, [doctors, doctorPreferencesLoaded]);

  // handlePresetChange and date range computation removed — uses global useTimeRange()

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["allEntriesForReport", from, to],
    queryFn: () => fetchAllEntriesForExport(from, to),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
  const entryIds = useMemo(() => entries.map(e => Number(e.id)), [entries]);
  const { data: medicationEffects = [] } = useMedicationEffectsForEntries(entryIds);
  
  const { data: totalEntryCount = 0, isLoading: isCountLoading } = useQuery({
    queryKey: ["entriesCount", from, to],
    queryFn: () => countEntriesInRange(from, to),
    staleTime: 30_000,
  });

  // Save report settings (debounced)
  useEffect(() => {
    if (!settingsLoaded) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        await supabase
          .from("user_report_settings")
          .upsert({
            user_id: user.id,
            default_report_preset: preset,
            include_statistics: true,
            include_chart: true,
            include_ai_analysis: includePremiumAI,
            include_entries_list: includeEntriesList,
            include_medication_summary: true,
            include_patient_data: true,
            include_doctor_data: includeDoctorData,
            include_all_medications: true,
            selected_medications: [],
            last_include_doctors_flag: includeDoctorData,
            last_doctor_export_ids: selectedDoctorIds,
            include_entry_notes: includeNotes,
            include_context_notes: false,
          } as any, { onConflict: "user_id" });
      } catch (error) {
        console.error("Error saving report settings:", error);
      }
    }, 400);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [settingsLoaded, preset, includePremiumAI, includeEntriesList, includeDoctorData, selectedDoctorIds, includeNotes]);

  // Build central report data (Single Source of Truth) – always ALL entries
  const reportData = useMemo<ReportData | null>(() => {
    if (entries.length === 0) return null;
    
    return buildReportData({
      entries,
      medicationEffects: medicationEffects.map(e => ({
        entry_id: e.entry_id,
        med_name: e.med_name,
        effect_rating: e.effect_rating,
        effect_score: e.effect_score
      })),
      fromDate: from,
      toDate: to,
      now: new Date()
    });
  }, [entries, medicationEffects, from, to]);

  // Day buckets für Pie Chart (Single Source of Truth)
  const dayBuckets = useMemo(() => {
    return computeDiaryDayBuckets({
      startDate: from,
      endDate: to,
      entries: entries.map(e => ({
        selected_date: e.selected_date,
        timestamp_created: e.timestamp_created,
        pain_level: e.pain_level,
        medications: e.medications,
      })),
      documentedDaysOnly: false,
    });
  }, [entries, from, to]);

  // Medication stats from report data
  const medicationStats = useMemo(() => {
    if (!reportData) return [];
    
    return reportData.acuteMedicationStats.map(stat => ({
      name: stat.name,
      count: Math.round(stat.totalUnitsInRange),
      avgEffect: stat.avgEffectiveness,
      ratedCount: stat.ratedCount,
      totalUnitsInRange: stat.totalUnitsInRange,
      avgPerMonth: stat.avgPerMonth,
      last30Units: stat.last30Units
    }));
  }, [reportData]);

  const selectedDoctorsForExport = useMemo(() => {
    if (!includeDoctorData) return [];
    if (selectedDoctorIds.length > 0) {
      return doctors.filter(d => d.id && selectedDoctorIds.includes(d.id));
    }
    return doctors;
  }, [doctors, selectedDoctorIds, includeDoctorData]);

  // Filter for active doctors only
  const activeDoctors = useMemo(() => 
    doctors.filter(d => d.is_active !== false),
    [doctors]
  );

  // Intelligent reminder for missing data before PDF generation
  const proceedWithPdfGenerationRef = useRef<() => Promise<void>>();
  
  useEffect(() => {
    proceedWithPdfGenerationRef.current = async () => {
      // Doctor selection is now inline (dropdown) – no popup needed
      let doctorsToExport: Doctor[] = [];
      if (includeDoctorData && activeDoctors.length === 1) {
        doctorsToExport = activeDoctors;
      } else if (includeDoctorData && activeDoctors.length > 1) {
        doctorsToExport = activeDoctors.filter(d => d.id && selectedDoctorIds.includes(d.id));
        if (doctorsToExport.length === 0) doctorsToExport = [activeDoctors[0]];
      }
      await actuallyGenerateDiaryPDF(doctorsToExport);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDoctorData, activeDoctors, selectedDoctorsForExport]);
  
  const handleReminderNavigate = useCallback((target: 'personal' | 'doctors') => {
    setPendingNavigationTarget(target);
    if (onNavigate) {
      if (target === 'personal') {
        onNavigate('settings-account');
      } else {
        onNavigate('settings-doctors');
      }
    }
  }, [onNavigate]);
  
  const reminder = useReportReminder(
    useCallback(() => {
      proceedWithPdfGenerationRef.current?.();
    }, []),
    handleReminderNavigate
  );

  // ============== PREMIUM KI-ANALYSEBERICHT ==============
  const generatePremiumAIReport = async (): Promise<PremiumAIReportResult | null> => {
    if (!includePremiumAI) return null;
    
    setIsGeneratingAIReport(true);
    setPremiumAIError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-ai-diary-report', {
        body: {
          fromDate: from,
          toDate: to,
          includeStats: true,
          includeTherapies: true,
          includeEntryNotes: includeNotes,
          includeContextNotes: false, // Private notes never shared
        }
      });
      
      if (error) {
        console.error("Premium AI Report Error:", error);
        setPremiumAIError("KI-Bericht konnte nicht erstellt werden.");
        return null;
      }
      
      if (data?.errorCode) {
        const errorMessages: Record<string, string> = {
          'QUOTA_EXCEEDED': `Monatliches Limit erreicht (${data.quota?.used || 0}/${data.quota?.limit || 5}). Deine Berichte findest du unter KI-Berichte.`,
          'COOLDOWN': `Bitte warte noch ${data.cooldownRemaining || 60} Sekunden.`,
          'AI_DISABLED': 'KI ist in deinen Einstellungen deaktiviert.',
          'NO_DATA': 'Keine Daten im gewählten Zeitraum.',
          'RATE_LIMIT': 'Zu viele Anfragen. Bitte später erneut versuchen.',
          'PAYMENT_REQUIRED': 'Guthaben aufgebraucht.',
        };
        
        const message = errorMessages[data.errorCode] || data.error || 'Fehler beim Erstellen des KI-Berichts.';
        setPremiumAIError(message);
        
        if (data.errorCode === 'QUOTA_EXCEEDED') {
          refetchQuota();
          toast.error(message, {
            action: onNavigate ? {
              label: "KI-Berichte",
              onClick: () => onNavigate('ai-reports')
            } : undefined
          });
        } else if (data.errorCode === 'COOLDOWN') {
          toast.warning(message);
        } else {
          toast.error(message);
        }
        
        return null;
      }
      
      if (data?.success && data?.report) {
        setPremiumAIReport(data.report);
        refetchQuota();
        toast.success("KI-Analysebericht erstellt und gespeichert.", {
          description: "Du findest ihn auch unter KI-Berichte."
        });
        return data.report as PremiumAIReportResult;
      }
      
      return null;
    } catch (err) {
      console.error("Premium AI Report Exception:", err);
      setPremiumAIError("Netzwerkfehler beim KI-Bericht.");
      toast.error("KI-Bericht konnte nicht erstellt werden.");
      return null;
    } finally {
      setIsGeneratingAIReport(false);
    }
  };

  // PDF Generation - ALWAYS fetches fresh data
  const actuallyGenerateDiaryPDF = async (selectedDoctors: Doctor[]) => {
    setIsGeneratingReport(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let freshPatientData = patientData;
      
      if (user) {
        const { data: patientResult } = await supabase
          .from('patient_data')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (patientResult) {
          freshPatientData = patientResult;
        }
      }
      
      console.log(`[PDF Export] Lade frische Daten für Zeitraum ${from} bis ${to}...`);
      const freshEntries = await fetchAllEntriesForExport(from, to);
      
      console.log(`[PDF Export] ${freshEntries.length} Einträge geladen (UI hatte: ${entries.length})`);
      
      if (freshEntries.length !== entries.length) {
        console.warn(`[PDF Export] ACHTUNG: UI zeigte ${entries.length} Einträge, aber DB hat ${freshEntries.length}!`);
      }
      
      const freshEntryIds = freshEntries.map(e => Number(e.id));
      
      const { data: freshEffects } = await supabase
        .from('medication_effects')
        .select('*')
        .in('entry_id', freshEntryIds);
      
      const freshReportData = buildReportData({
        entries: freshEntries,
        medicationEffects: (freshEffects || []).map(e => ({
          entry_id: e.entry_id,
          med_name: e.med_name,
          effect_rating: e.effect_rating,
          effect_score: e.effect_score,
        })),
        fromDate: from,
        toDate: to,
        now: new Date(),
      });
      
      console.log('[PDF Export] Sanity Check:', {
        freshEntriesCount: freshEntries.length,
        reportDataAttacks: freshReportData.kpis.totalAttacks,
        daysInRange: freshReportData.kpis.daysInRange,
        daysWithPain: freshReportData.kpis.daysWithPain,
        daysWithMedication: freshReportData.kpis.daysWithAcuteMedication
      });
      
      if (freshEntries.length !== freshReportData.kpis.totalAttacks) {
        console.error('[PDF Export] FEHLER: Entries-Count stimmt nicht mit KPIs überein!');
      }
      
      devLog('PDF Generierung gestartet', { 
        context: 'DiaryReport',
        data: { from, to, freshEntriesCount: freshEntries.length, attacks: freshReportData.kpis.totalAttacks }
      });

      let aiAnalysis = undefined;
      
      if (includePremiumAI) {
        try {
          const { data, error } = await supabase.functions.invoke('generate-doctor-summary', {
            body: { 
              fromDate: `${from}T00:00:00Z`, 
              toDate: `${to}T23:59:59Z`,
              includeContextNotes: false, // Private notes never shared
              totalAttacks: freshReportData.kpis.totalAttacks,
              daysInRange: freshReportData.kpis.daysInRange
            }
          });
          
          if (!error && data?.summary) {
            aiAnalysis = data.summary;
            setAnalysisReport(data.summary);
          }
        } catch (err) {
          devWarn('KI-Analyse übersprungen', { context: 'DiaryReport', data: err });
        }
      }

      // ============== PREMIUM KI-ANALYSEBERICHT ==============
      let premiumAIReportData: PremiumAIReportResult | null = null;
      
      console.log('[PDF Export] Premium-KI Status:', { 
        includePremiumAI, 
        willGenerateAI: includePremiumAI 
      });
      
      if (includePremiumAI) {
        console.log('[PDF Export] Starte Premium-KI-Generierung...');
        premiumAIReportData = await generatePremiumAIReport();
        
        if (premiumAIReportData) {
          console.log('[PDF Export] Premium-KI erfolgreich:', {
            keyFindingsCount: premiumAIReportData.keyFindings?.length || 0,
            sectionsCount: premiumAIReportData.sections?.length || 0
          });
        } else {
          console.warn('[PDF Export] Premium-KI fehlgeschlagen - PDF erhält Fallback-Hinweis');
          devWarn('Premium-KI-Bericht fehlgeschlagen, PDF erhält Fallback-Hinweis', { context: 'DiaryReport' });
        }
      }

      const freeTextMode = includeNotes ? 'short_notes' : 'none';

      const freshMedicationStats = freshReportData.acuteMedicationStats.map(stat => ({
        name: stat.name,
        count: stat.last30Units,
        avgEffect: stat.avgEffectiveness ?? 0,
        ratedCount: stat.ratedCount,
        totalUnitsInRange: stat.totalUnitsInRange,
        avgPerMonth: stat.avgPerMonth,
        last30Units: stat.last30Units,
      }));

      // ── Begleitsymptome Daten laden ──
      let symptomData: SymptomDataForPdf | undefined;
      try {
        const freshEntryIds = freshEntries.map(e => Number(e.id));
        
        const [catalogRes, esRes, burdenRes] = await Promise.all([
          supabase.from('symptom_catalog').select('id, name').eq('is_active', true),
          freshEntryIds.length > 0
            ? supabase.from('entry_symptoms').select('entry_id, symptom_id').in('entry_id', freshEntryIds)
            : Promise.resolve({ data: [], error: null }),
          user
            ? supabase.from('user_symptom_burden').select('symptom_key, burden_level').eq('user_id', user.id)
            : Promise.resolve({ data: [], error: null }),
        ]);

        const catalog = new Map<string, string>();
        for (const c of (catalogRes.data || [])) catalog.set(c.id, c.name);

        const burdenMap = new Map<string, number>();
        for (const b of (burdenRes.data || [])) {
          if (b.burden_level != null) burdenMap.set(b.symptom_key, b.burden_level);
        }

        const checkedEntryIds = new Set<number>();
        for (const e of freshEntries) {
          if (e.symptoms_state === 'viewed' || e.symptoms_state === 'edited') {
            checkedEntryIds.add(Number(e.id));
          }
        }

        symptomData = {
          catalog,
          entrySymptoms: (esRes.data || []).map(es => ({
            entry_id: Number(es.entry_id),
            symptom_id: es.symptom_id,
          })),
          burdenMap,
          totalEntries: freshEntries.length,
          checkedEntries: checkedEntryIds.size,
          checkedEntryIds,
        };
      } catch (err) {
        console.warn('[PDF Export] Begleitsymptome konnten nicht geladen werden:', err);
      }

      // ── ME/CFS-Belastungsdaten ──
      let meCfsData: { avgScore: number; avgLabel: string; peakLabel: string; burdenPct: number; burdenPer30: number; daysWithBurden: number; documentedDays: number; calendarDays: number; iqrLabel: string; dataQualityNote?: string } | undefined = undefined;
      {
        const { getMeCfsTrackingStartDate, filterEntriesForMeCfs } = await import("@/lib/mecfs/trackingStart");
        const { daysBetweenInclusive } = await import("@/lib/dateRange/rangeResolver");
        const mecfsStart = await getMeCfsTrackingStartDate();
        const mecfsEntries = filterEntriesForMeCfs(freshEntries, mecfsStart);

        const dayMap = new Map<string, number>();
        for (const e of mecfsEntries) {
          const date = e.selected_date || e.timestamp_created?.split('T')[0];
          if (!date) continue;
          const score = (e as any).me_cfs_severity_score ?? 0;
          dayMap.set(date, Math.max(dayMap.get(date) ?? 0, score));
        }
        const scores = Array.from(dayMap.values());
        const documentedDays = scores.length;
        // Calculate calendarDays from mecfs-clamped range
        const effectiveStart = mecfsStart && mecfsStart > from ? mecfsStart : from;
        const calendarDays = daysBetweenInclusive(effectiveStart, to);
        if (documentedDays > 0) {
          const daysWithBurden = scores.filter(s => s > 0).length;
          const avg = scores.reduce((a, b) => a + b, 0) / documentedDays;
          const { scoreToLevel, levelToLabelDe } = await import("@/lib/mecfs/constants");
          const avgLevel = scoreToLevel(avg);
          const peakScore = Math.max(...scores);
          const peakLabel = levelToLabelDe(scoreToLevel(peakScore));
          const sorted = [...scores].sort((a, b) => a - b);
          const pIdx = (p: number) => {
            const i = (p / 100) * (sorted.length - 1);
            const lo = Math.floor(i); const hi = Math.ceil(i);
            return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
          };
          const p25 = Math.round(pIdx(25) * 10) / 10;
          const p75 = Math.round(pIdx(75) * 10) / 10;
          const iqrLabel = p25 === p75 ? `${p25}/10` : `${p25}–${p75}/10`;
          const burdenPer30 = Math.round(((daysWithBurden / documentedDays) * 30) * 10) / 10;
          meCfsData = {
            avgScore: Math.round(avg * 10) / 10,
            avgLabel: levelToLabelDe(avgLevel),
            peakLabel,
            burdenPct: Math.round((daysWithBurden / documentedDays) * 100),
            burdenPer30,
            daysWithBurden,
            documentedDays,
            calendarDays,
            iqrLabel,
          };
        }
      }

      // PDF mit FRISCHEN Daten generieren – alle Kernabschnitte immer enthalten
      const pdfBytes = await buildDiaryPdf({
        title: "Kopfschmerztagebuch",
        from,
        to,
        entries: freshEntries,
        selectedMeds: [], // No medication filtering – always all
        
        includeStats: true, // Always included
        includeChart: true, // Always included
        includeAnalysis: !includePremiumAI && !!aiAnalysis, // Static analysis if not premium
        includeEntriesList,
        includePatientData: true,
        includeDoctorData: includeDoctorData && selectedDoctors.length > 0,
        includeMedicationCourses: true, // Therapies always included
        includePatientNotes: false,
        freeTextExportMode: freeTextMode as any,
        includePrivateNotes: false, // Private notes are NEVER included
        
        isPremiumAIRequested: includePremiumAI,
        
        analysisReport: aiAnalysis,
        patientNotes: "",
        medicationStats: freshMedicationStats,
        medicationCourses: medicationCourses.map(c => ({
          medication_name: c.medication_name,
          type: c.type,
          dose_text: c.dose_text || undefined,
          start_date: c.start_date,
          end_date: c.end_date || undefined,
          is_active: c.is_active,
          subjective_effectiveness: c.subjective_effectiveness ?? undefined,
          had_side_effects: c.had_side_effects ?? undefined,
          side_effects_text: c.side_effects_text || undefined,
          discontinuation_reason: c.discontinuation_reason || undefined,
          discontinuation_details: c.discontinuation_details || undefined,
          baseline_migraine_days: c.baseline_migraine_days || undefined,
          baseline_impairment_level: c.baseline_impairment_level || undefined,
          note_for_physician: c.note_for_physician || undefined,
        })),
        patientData: freshPatientData ? {
          firstName: freshPatientData.first_name || "",
          lastName: freshPatientData.last_name || "",
          street: freshPatientData.street || "",
          postalCode: freshPatientData.postal_code || "",
          city: freshPatientData.city || "",
          phone: freshPatientData.phone || "",
          fax: freshPatientData.fax || "",
          email: userEmail || "",
          dateOfBirth: freshPatientData.date_of_birth || "",
          healthInsurance: freshPatientData.health_insurance || "",
          insuranceNumber: freshPatientData.insurance_number || ""
        } : undefined,
        doctors: selectedDoctors.length > 0 ? selectedDoctors.map(d => ({
          firstName: d.first_name || "",
          lastName: d.last_name || "",
          specialty: d.specialty || "",
          street: d.street || "",
          postalCode: d.postal_code || "",
          city: d.city || "",
          phone: d.phone || "",
          fax: d.fax || "",
          email: d.email || ""
        })) : undefined,
        premiumAIReport: premiumAIReportData || undefined,
        symptomData,
        meCfsData,
      });

      const timestamp = Date.now();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fromDate = typeof from === 'string' ? new Date(from) : from;
      const toDate = typeof to === 'string' ? new Date(to) : to;
      const fromStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`;
      const toStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;
      link.download = `Kopfschmerztagebuch_${fromStr}_bis_${toStr}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success("PDF erfolgreich erstellt");
    } catch (error) {
      console.error("PDF-Generierung fehlgeschlagen:", error);
      const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
      toast.error(`PDF konnte nicht erstellt werden: ${errorMessage}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Entry point: Check for missing data before PDF generation
  const generatePDF = async () => {
    if (!entries.length) {
      toast.error("Keine Einträge im ausgewählten Zeitraum");
      return;
    }
    const shouldProceed = reminder.runCheck();
    if (shouldProceed) {
      proceedWithPdfGenerationRef.current?.();
    }
  };

  const handleDoctorSelectionConfirm = async (selectedDoctors: Doctor[]) => {
    setShowDoctorSelection(false);
    if (pendingPdfType === "diary") {
      await actuallyGenerateDiaryPDF(selectedDoctors);
    } else if (pendingPdfType === "medplan") {
      await actuallyGenerateMedPlanPDF(selectedDoctors);
    }
    setPendingPdfType(null);
  };

  const actuallyGenerateMedPlanPDF = async (selectedDoctors: Doctor[]) => {
    if (medicationCourses.length === 0) {
      toast.error("Keine Medikamentenverläufe vorhanden");
      return;
    }

    setIsGeneratingMedPlan(true);
    try {
      const pdfBytes = await buildMedicationPlanPdf({
        medicationCourses: medicationCourses.map(c => ({
          id: c.id,
          medication_name: c.medication_name,
          type: c.type,
          dose_text: c.dose_text,
          start_date: c.start_date,
          end_date: c.end_date,
          is_active: c.is_active,
          subjective_effectiveness: c.subjective_effectiveness,
          had_side_effects: c.had_side_effects,
          side_effects_text: c.side_effects_text,
          discontinuation_reason: c.discontinuation_reason,
          discontinuation_details: c.discontinuation_details,
          baseline_migraine_days: c.baseline_migraine_days,
          baseline_impairment_level: c.baseline_impairment_level,
          note_for_physician: c.note_for_physician,
        })),
        patientData: patientData ? {
          firstName: patientData.first_name || "",
          lastName: patientData.last_name || "",
          dateOfBirth: patientData.date_of_birth || "",
          street: patientData.street || "",
          postalCode: patientData.postal_code || "",
          city: patientData.city || "",
          phone: patientData.phone || "",
          fax: patientData.fax || "",
          healthInsurance: patientData.health_insurance || "",
          insuranceNumber: patientData.insurance_number || "",
        } : undefined,
        doctors: selectedDoctors.map(d => ({
          firstName: d.first_name || "",
          lastName: d.last_name || "",
          title: d.title || "",
          specialty: d.specialty || "",
          street: d.street || "",
          postalCode: d.postal_code || "",
          city: d.city || "",
          phone: d.phone || "",
          fax: d.fax || "",
          email: d.email || "",
        })),
      });

      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const todayDate = new Date();
      const dateStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
      link.download = `Medikationsplan_${dateStr}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success("Medikationsplan PDF erstellt");
    } catch (error) {
      console.error("Medikationsplan PDF-Generierung fehlgeschlagen:", error);
      toast.error("Medikationsplan konnte nicht erstellt werden");
    } finally {
      setIsGeneratingMedPlan(false);
    }
  };

  const generateMedicationPlanPdf = async () => {
    if (medicationCourses.length === 0) {
      toast.error("Keine Medikamentenverläufe vorhanden");
      return;
    }

    if (activeDoctors.length > 1) {
      // Use inline-selected doctor
      const selected = activeDoctors.filter(d => d.id && selectedDoctorIds.includes(d.id));
      await actuallyGenerateMedPlanPDF(selected.length > 0 ? selected : [activeDoctors[0]]);
    } else {
      await actuallyGenerateMedPlanPDF(activeDoctors);
    }
  };

  const exportCSV = () => {
    if (!entries.length) {
      toast.error("Keine Einträge im ausgewählten Zeitraum");
      return;
    }
    const header = ["Datum/Zeit","Schmerzlevel","Medikamente","Notiz"];
    const rows = entries.map(e => {
      const dt = e.selected_date && e.selected_time
        ? `${e.selected_date} ${e.selected_time}`
        : new Date(e.timestamp_created).toLocaleString();
      const meds = (e.medications || []).join("; ");
      const note = (e.notes ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
      return [dt, e.pain_level, meds, `"${note}"`];
    });
    const lines = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kopfschmerztagebuch_${from}_bis_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV erfolgreich exportiert");
  };

  // Toggle row component for consistent styling
  const ToggleRow = ({ 
    label, 
    checked, 
    onCheckedChange, 
    disabled, 
    subtext 
  }: { 
    label: string; 
    checked: boolean; 
    onCheckedChange: (checked: boolean) => void; 
    disabled?: boolean;
    subtext?: string;
  }) => (
    <div className={`flex items-center justify-between py-2.5 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <span className="text-sm">{label}</span>
        {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="ml-3 shrink-0"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <AppHeader title="Kopfschmerztagebuch (PDF)" onBack={onBack} sticky />

      <div className="p-4 space-y-4">

        {/* ═══════════════════════════════════════════════════════════════════
            ZEITRAUM CARD
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Zeitraum für den Bericht</h3>
          
          <p className="text-xs text-muted-foreground/80 -mt-1">
            Dies betrifft nur den Bericht – deine gespeicherten Daten bleiben vollständig erhalten.
          </p>
          
          <TimeRangeSelector compact />

          {/* Entry count */}
          <div className="text-sm text-muted-foreground pt-1">
            {isLoading || isCountLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Lade Einträge...
              </span>
            ) : totalEntryCount > 0 ? (
              <span>
                <span className="font-medium text-foreground">{totalEntryCount.toLocaleString('de-DE')}</span> Einträge 
                {" "}({format(new Date(from), 'dd.MM.yyyy')} – {format(new Date(to), 'dd.MM.yyyy')})
              </span>
            ) : (
              <span className="text-destructive">Keine Einträge im Zeitraum</span>
            )}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            OPTIONEN CARD – Vereinfacht: nur essenzielle Entscheidungen
            Stats, Analyse, Medikamente, Therapien sind IMMER enthalten.
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="divide-y divide-border/50">
          {/* Arztdaten einbinden */}
          <div className="p-4">
            <ToggleRow
              label="Arztdaten einbinden"
              checked={includeDoctorData && activeDoctors.length > 0}
              onCheckedChange={setIncludeDoctorData}
              disabled={activeDoctors.length === 0}
            />
            {activeDoctors.length === 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Für den Arztbericht kannst du Arztdaten hinterlegen.
                </p>
                {onNavigate && (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigate('settings-doctors?origin=export_migraine_diary')}
                    >
                      Arzt hinzufügen
                    </Button>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setIncludeDoctorData(false)}
                    >
                      Überspringen
                    </button>
                  </div>
                )}
              </div>
            )}
            {includeDoctorData && activeDoctors.length === 1 && (
              <p className="text-xs text-muted-foreground mt-1">
                {activeDoctors[0].title ? `${activeDoctors[0].title} ` : ''}
                {activeDoctors[0].first_name} {activeDoctors[0].last_name}
                {activeDoctors[0].specialty ? ` · ${activeDoctors[0].specialty}` : ''}
              </p>
            )}
            {includeDoctorData && activeDoctors.length > 1 && (
              <div className="mt-2">
                <select
                  className="w-full border border-border/40 rounded-md px-3 h-9 bg-background text-foreground text-sm"
                  value={selectedDoctorIds[0] || ''}
                  onChange={(e) => setSelectedDoctorIds([e.target.value])}
                >
                  {activeDoctors.map(d => (
                    <option key={d.id} value={d.id || ''}>
                      {d.title ? `${d.title} ` : ''}{d.first_name} {d.last_name}
                      {d.specialty ? ` · ${d.specialty}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Notizen einbeziehen */}
          <div className="p-4">
            <ToggleRow
              label="Notizen einbeziehen"
              checked={includeNotes}
              onCheckedChange={setIncludeNotes}
            />
            {/* Privacy is decided at entry level – private notes are always excluded */}
            <p className="text-xs text-muted-foreground/60 mt-1">
              Private Notizen werden nicht exportiert.
            </p>
          </div>

          {/* Dokumentierte Tage (Liste) */}
          <div className="p-4">
            <ToggleRow
              label="Dokumentierte Tage (Liste)"
              checked={includeEntriesList}
              onCheckedChange={setIncludeEntriesList}
            />
          </div>

          {/* Premium Section: KI-Analysebericht */}
          <div className="p-4 border-t border-border/30 bg-gradient-to-r from-amber-500/5 to-amber-600/5">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Brain className="h-4 w-4 text-amber-500/80" />
                <span className="text-sm font-medium">KI-Analysebericht</span>
                <PremiumBadge />
              </div>
              <Switch 
                checked={includePremiumAI && !isQuotaExhausted && !isAIDisabled} 
                onCheckedChange={(checked) => {
                  if (!isQuotaExhausted && !isAIDisabled) {
                    setIncludePremiumAI(checked);
                  }
                }}
                disabled={isGeneratingAIReport || isQuotaExhausted || isAIDisabled}
                className="ml-3 shrink-0"
              />
            </div>
            
            {(isGeneratingAIReport || isAIDisabled || isQuotaExhausted || premiumAIError) && (
              <div className="mt-2 pl-6">
                {isGeneratingAIReport ? (
                  <p className="text-xs text-muted-foreground">Wird erstellt…</p>
                ) : isAIDisabled ? (
                  <p className="text-xs text-muted-foreground">KI deaktiviert</p>
                ) : isQuotaExhausted ? (
                  <p className="text-xs text-muted-foreground">
                    Verfügbar ab{" "}
                    {(() => {
                      const now = new Date();
                      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                      return nextMonth.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    })()}
                  </p>
                ) : premiumAIError ? (
                  <p className="text-xs text-muted-foreground">{premiumAIError}</p>
                ) : null}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          STICKY ACTION BAR
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 space-y-2">
        <Button 
          onClick={generatePDF}
          disabled={!entries.length || isGeneratingReport}
          size="lg"
          className="w-full"
        >
          {isGeneratingReport ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              PDF wird erstellt…
            </>
          ) : (
            <>
              <FileText className="mr-2 h-5 w-5" />
              PDF erstellen
            </>
          )}
        </Button>
      </div>

      {/* Intelligent Reminder Dialog */}
      <ReportReminderDialog
        open={reminder.showDialog}
        dialogType={reminder.dialogType}
        missingData={reminder.missingData}
        onNavigate={reminder.handleNavigate}
        onLater={reminder.handleLater}
        onNeverAsk={reminder.handleNeverAsk}
        onClose={reminder.closeDialog}
      />

      {/* Doctor Selection Dialog */}
      <DoctorSelectionDialog
        open={showDoctorSelection}
        onClose={() => setShowDoctorSelection(false)}
        doctors={doctors}
        onConfirm={(selected) => {
          const newIds = selected.map(d => d.id).filter(Boolean) as string[];
          setSelectedDoctorIds(newIds);
          handleDoctorSelectionConfirm(selected);
        }}
        preSelectedIds={selectedDoctorIds}
        title={pendingPdfType === "diary" ? "Arzt für Kopfschmerztagebuch auswählen" : "Arzt für Medikationsplan auswählen"}
      />
    </div>
  );
}
