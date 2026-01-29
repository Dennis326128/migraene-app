import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PainEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { fetchAllEntriesForExport, countEntriesInRange } from "@/features/entries/api/entries.api";
import { buildDiaryPdf } from "@/lib/pdf/report";
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan";
import { mapTextLevelToScore } from "@/lib/utils/pain";
import { useMedicationEffectsForEntries } from "@/features/medication-effects/hooks/useMedicationEffects";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { Loader2, ArrowLeft, FileText, Table, Pill, ChevronDown, ChevronRight, Brain } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { TimeRangeButtons, type TimeRangePreset } from "./TimeRangeButtons";
import { DoctorSelectionDialog, type Doctor } from "./DoctorSelectionDialog";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

function addMonths(d: Date, m: number) {
  const dd = new Date(d);
  dd.setMonth(dd.getMonth() + m);
  return dd;
}
function fmt(d: Date) { return d.toISOString().slice(0,10); }

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

// Persisted settings interface
interface ReportSettingsState {
  preset: Preset;
  customStart: string;
  customEnd: string;
  includeStats: boolean;
  includeEntriesList: boolean;
  includeAnalysis: boolean;
  includeTherapies: boolean;
  includeDoctorData: boolean;
  allMedications: boolean;
  selectedMedIds: string[];
  includeEntryNotes: boolean;
  includeContextNotes: boolean;
  lastDoctorIds: string[];
}

const DEFAULT_SETTINGS: Omit<ReportSettingsState, 'customStart' | 'customEnd'> = {
  preset: "3m",
  includeStats: true,
  includeEntriesList: true,
  includeAnalysis: true,
  includeTherapies: true,
  includeDoctorData: true,
  allMedications: true,
  selectedMedIds: [],
  includeEntryNotes: true,
  includeContextNotes: false,
  lastDoctorIds: [],
};

export default function DiaryReport({ onBack, onNavigate }: { onBack: () => void; onNavigate?: (target: string) => void }) {
  const { t } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const queryClient = useQueryClient();
  
  // Core state
  const [preset, setPreset] = useState<Preset>("3m");
  const [customStart, setCustomStart] = useState<string>(fmt(addMonths(today, -3)));
  const [customEnd, setCustomEnd] = useState<string>(fmt(today));
  
  // Essentials toggles
  const [includeStats, setIncludeStats] = useState<boolean>(true);
  const [includeEntriesList, setIncludeEntriesList] = useState<boolean>(true);
  const [includeAnalysis, setIncludeAnalysis] = useState<boolean>(true);
  const [includeTherapies, setIncludeTherapies] = useState<boolean>(true);
  
  // Medications
  const [allMedications, setAllMedications] = useState<boolean>(true);
  const [selectedMedIds, setSelectedMedIds] = useState<string[]>([]);
  const [medOptions, setMedOptions] = useState<string[]>([]);
  
  // Notes & Advanced
  const [includeEntryNotes, setIncludeEntryNotes] = useState<boolean>(true);
  const [includeDoctorData, setIncludeDoctorData] = useState<boolean>(true);
  const [includeContextNotes, setIncludeContextNotes] = useState<boolean>(false);
  
  // Advanced section
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  
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

  // Load all report settings from database
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
          // Time range
          if (settings.default_report_preset && ["1m","3m","6m","12m","all","custom"].includes(settings.default_report_preset)) {
            setPreset(settings.default_report_preset as Preset);
          }
          
          // Essentials
          if (settings.include_statistics !== null) setIncludeStats(settings.include_statistics);
          if (settings.include_entries_list !== null) setIncludeEntriesList(settings.include_entries_list);
          if (settings.include_ai_analysis !== null) setIncludeAnalysis(settings.include_ai_analysis);
          if (settings.include_medication_summary !== null) setIncludeTherapies(settings.include_medication_summary);
          
          // Doctor data
          if (settings.include_doctor_data !== null) setIncludeDoctorData(settings.include_doctor_data);
          
          // Medications
          if (settings.include_all_medications !== null) setAllMedications(settings.include_all_medications);
          if (settings.selected_medications && Array.isArray(settings.selected_medications)) {
            setSelectedMedIds(settings.selected_medications);
          }
          
          // Notes settings - cast to any since columns may not be in types yet
          const s = settings as any;
          if (s.include_entry_notes !== undefined && s.include_entry_notes !== null) {
            setIncludeEntryNotes(s.include_entry_notes);
          }
          if (s.include_context_notes !== undefined && s.include_context_notes !== null) {
            setIncludeContextNotes(s.include_context_notes);
          }
          
          // Premium AI setting
          if (settings.include_ai_analysis !== undefined && settings.include_ai_analysis !== null) {
            setIncludePremiumAI(settings.include_ai_analysis);
          }
          
          // Doctor IDs
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

  // Handle preset change - set custom dates when switching to custom
  const handlePresetChange = useCallback((newPreset: Preset) => {
    if (newPreset === 'custom' && preset !== 'custom') {
      setCustomStart(fmt(addMonths(today, -3)));
      setCustomEnd(fmt(today));
    }
    setPreset(newPreset);
  }, [preset, today]);

  // Compute date range
  const { from, to } = useMemo(() => {
    if (preset === "custom" && customStart && customEnd) {
      return { from: customStart, to: customEnd };
    }
    const end = fmt(today);
    let start: string;
    switch (preset) {
      case "1m": start = fmt(addMonths(today, -1)); break;
      case "3m": start = fmt(addMonths(today, -3)); break;
      case "6m": start = fmt(addMonths(today, -6)); break;
      case "12m": start = fmt(addMonths(today, -12)); break;
      case "all": start = "2000-01-01"; break;
      default: start = fmt(addMonths(today, -3));
    }
    return { from: start, to: end };
  }, [preset, customStart, customEnd, today]);

  const { data: entries = [], isLoading } = useEntries({ from, to });
  const entryIds = useMemo(() => entries.map(e => Number(e.id)), [entries]);
  const { data: medicationEffects = [] } = useMedicationEffectsForEntries(entryIds);
  
  // Fetch the ACTUAL total count of entries (no limit) for accurate display
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
            include_statistics: includeStats,
            include_chart: includeStats,
            include_ai_analysis: includePremiumAI, // Now saves Premium AI toggle state
            include_entries_list: includeEntriesList,
            include_medication_summary: includeTherapies,
            include_patient_data: true, // Always included
            include_doctor_data: includeDoctorData,
            include_all_medications: allMedications,
            selected_medications: selectedMedIds,
            last_include_doctors_flag: includeDoctorData,
            last_doctor_export_ids: selectedDoctorIds,
            include_entry_notes: includeEntryNotes,
            include_context_notes: includeContextNotes,
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
  }, [settingsLoaded, preset, includeStats, includePremiumAI, includeEntriesList, includeTherapies, includeDoctorData, allMedications, selectedMedIds, selectedDoctorIds, includeEntryNotes, includeContextNotes]);

  // Load medication options
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("user_medications")
        .select("name")
        .eq("user_id", user.id);
      if (!error && data?.length) {
        setMedOptions(Array.from(new Set(data.map(d => d.name))).sort());
      } else {
        const uniq = new Set<string>();
        entries.forEach(e => (e.medications || []).forEach(m => uniq.add(m)));
        setMedOptions(Array.from(uniq).sort());
      }
    })();
  }, [entries]);

  // Filter entries based on medication selection
  const filteredEntries = useMemo(() => {
    if (allMedications || selectedMedIds.length === 0) {
      return entries;
    }
    const medsSet = new Set(selectedMedIds);
    return entries.filter(e => {
      const meds = e.medications || [];
      return meds.some(m => medsSet.has(m)) || meds.length === 0;
    });
  }, [entries, allMedications, selectedMedIds]);

  // Build central report data for consistency (Single Source of Truth)
  const reportData = useMemo<ReportData | null>(() => {
    if (entries.length === 0) return null;
    
    // WICHTIG: Für KPIs und Attackenzahl verwenden wir ALLE entries im Zeitraum (nicht gefiltert)
    // Die Medikamenten-Statistik basiert ebenfalls auf allen entries
    return buildReportData({
      entries: entries, // Alle entries, nicht filteredEntries
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

  // Legacy medicationStats für Abwärtskompatibilität, aber mit erweiterten Feldern
  const medicationStats = useMemo(() => {
    if (!reportData) return [];
    
    return reportData.acuteMedicationStats.map(stat => ({
      name: stat.name,
      count: Math.round(stat.totalUnitsInRange), // Legacy: count = totalUnitsInRange
      avgEffect: stat.avgEffectiveness,
      ratedCount: stat.ratedCount,
      // Neue erweiterte Felder
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
  
  // Update the ref when dependencies change
  useEffect(() => {
    proceedWithPdfGenerationRef.current = async () => {
      // Only show selection dialog if MORE than 1 active doctor
      // If exactly 1 active doctor, auto-select and proceed
      if (includeDoctorData && activeDoctors.length > 1) {
        setPendingPdfType("diary");
        setShowDoctorSelection(true);
        return;
      }
      // Auto-select the only active doctor if exactly 1 exists
      const doctorsToExport = activeDoctors.length === 1 ? activeDoctors : selectedDoctorsForExport;
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

  // Check if all medications are selected
  const allMedsSelected = useMemo(() => {
    return medOptions.length > 0 && medOptions.every(m => selectedMedIds.includes(m));
  }, [medOptions, selectedMedIds]);

  // Toggle all medications
  const handleToggleAllMeds = () => {
    if (allMedsSelected) {
      setSelectedMedIds([]);
    } else {
      setSelectedMedIds([...medOptions]);
    }
  };

  // ============== PREMIUM KI-ANALYSEBERICHT ==============
  const generatePremiumAIReport = async (): Promise<PremiumAIReportResult | null> => {
    if (!includePremiumAI) return null;
    
    setIsGeneratingAIReport(true);
    setPremiumAIError(null);
    
    try {
      // Send date-only format (YYYY-MM-DD) - edge function handles timezone interpretation
      const { data, error } = await supabase.functions.invoke('generate-ai-diary-report', {
        body: {
          fromDate: from,  // YYYY-MM-DD
          toDate: to,      // YYYY-MM-DD
          includeStats,
          includeTherapies,
          includeEntryNotes,
          includeContextNotes,
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
          // Refresh quota to update UI
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
        // Refresh quota after successful generation
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

  // PDF Generation - ALWAYS fetches fresh data (including patient/doctor data)
  const actuallyGenerateDiaryPDF = async (selectedDoctors: Doctor[]) => {
    setIsGeneratingReport(true);
    
    try {
      // FRISCHE Patientendaten laden
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
      
      // KRITISCH: Lade ALLE Einträge frisch aus der DB - NICHT aus dem UI-Cache!
      console.log(`[PDF Export] Lade frische Daten für Zeitraum ${from} bis ${to}...`);
      const freshEntries = await fetchAllEntriesForExport(from, to);
      
      console.log(`[PDF Export] ${freshEntries.length} Einträge geladen (UI hatte: ${entries.length})`);
      
      // Warnung wenn UI-Daten abweichen (= UI war unvollständig)
      if (freshEntries.length !== entries.length) {
        console.warn(`[PDF Export] ACHTUNG: UI zeigte ${entries.length} Einträge, aber DB hat ${freshEntries.length}!`);
      }
      
      // Berechne Report-Daten aus den FRISCHEN Einträgen
      const freshEntryIds = freshEntries.map(e => Number(e.id));
      
      // Lade auch frische Medikamenteneffekte
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
      
      // SANITY CHECK: Konsistenz prüfen
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
      
      if (includeAnalysis) {
        try {
          const { data, error } = await supabase.functions.invoke('generate-doctor-summary', {
            body: { 
              fromDate: `${from}T00:00:00Z`, 
              toDate: `${to}T23:59:59Z`,
              includeContextNotes: includeContextNotes,
              // Konsistente Daten aus frischem Report
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
          // PDF wird mit Fallback-Hinweis erstellt (NICHT mit statischer Analyse!)
          console.warn('[PDF Export] Premium-KI fehlgeschlagen - PDF erhält Fallback-Hinweis');
          devWarn('Premium-KI-Bericht fehlgeschlagen, PDF erhält Fallback-Hinweis', { context: 'DiaryReport' });
        }
      }

      // Determine freeTextExportMode based on toggle
      const freeTextMode = includeContextNotes ? 'notes_and_context' : (includeEntryNotes ? 'short_notes' : 'none');

      // Medikamenten-Statistik aus frischen Daten - korrekt gemappt
      const freshMedicationStats = freshReportData.acuteMedicationStats.map(stat => ({
        name: stat.name,
        count: stat.last30Units, // Für Abwärtskompatibilität
        avgEffect: stat.avgEffectiveness ?? 0,
        ratedCount: stat.ratedCount,
        totalUnitsInRange: stat.totalUnitsInRange,
        avgPerMonth: stat.avgPerMonth,
        last30Units: stat.last30Units,
      }));

      // PDF mit FRISCHEN Daten generieren
      const pdfBytes = await buildDiaryPdf({
        title: "Kopfschmerztagebuch",
        from,
        to,
        entries: freshEntries, // FRISCHE entries, nicht UI-cache
        selectedMeds: allMedications ? [] : selectedMedIds,
        
        includeStats,
        includeChart: includeStats,
        // KRITISCH: Statische Analyse nur wenn NICHT Premium gewählt
        includeAnalysis: !includePremiumAI && includeAnalysis && !!aiAnalysis,
        includeEntriesList,
        includePatientData: true, // Always include
        includeDoctorData: includeDoctorData && selectedDoctors.length > 0,
        includeMedicationCourses: includeTherapies,
        includePatientNotes: false,
        freeTextExportMode: freeTextMode as any,
        
        // KRITISCH: Explizites Flag ob User Premium-KI ausgewählt hat
        isPremiumAIRequested: includePremiumAI,
        
        analysisReport: aiAnalysis,
        patientNotes: "",
        medicationStats: freshMedicationStats,
        medicationCourses: includeTherapies ? medicationCourses.map(c => ({
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
        })) : undefined,
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
        // Premium KI-Analysebericht Daten (wenn vorhanden)
        premiumAIReport: premiumAIReportData || undefined,
      });

      // Neuer Blob mit Timestamp für "always fresh"
      const timestamp = Date.now();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fromDate = typeof from === 'string' ? new Date(from) : from;
      const toDate = typeof to === 'string' ? new Date(to) : to;
      const fromStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`;
      const toStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;
      
      // Timestamp im Dateinamen für garantiert frischen Download
      link.download = `Kopfschmerztagebuch_${fromStr}_bis_${toStr}_${timestamp}.pdf`;
      link.click();
      URL.revokeObjectURL(url); // Sofort aufräumen
      
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
    if (!filteredEntries.length) {
      toast.error("Keine Einträge im ausgewählten Zeitraum");
      return;
    }
    // Run intelligent reminder check - shows dialog max 1x per day
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

    if (doctors.length > 1) {
      setPendingPdfType("medplan");
      setShowDoctorSelection(true);
      return;
    }

    await actuallyGenerateMedPlanPDF(doctors);
  };

  const exportCSV = () => {
    if (!filteredEntries.length) {
      toast.error("Keine Einträge im ausgewählten Zeitraum");
      return;
    }
    const header = ["Datum/Zeit","Schmerzlevel","Medikamente","Notiz"];
    const rows = filteredEntries.map(e => {
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
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button 
          variant="ghost" 
          onClick={onBack} 
          className="p-2 hover:bg-secondary/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1">Kopfschmerztagebuch (PDF)</h1>
      </div>

      <div className="p-4 space-y-4">

        {/* ═══════════════════════════════════════════════════════════════════
            ZEITRAUM CARD - Compact horizontal scroll
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Zeitraum</h3>
          <TimeRangeButtons value={preset} onChange={handlePresetChange} compact />

          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Start</label>
                <input 
                  className="border-border/40 border rounded-md px-3 h-10 w-full bg-background text-foreground text-sm" 
                  type="date" 
                  value={customStart} 
                  onChange={e => setCustomStart(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Ende</label>
                <input 
                  className="border-border/40 border rounded-md px-3 h-10 w-full bg-background text-foreground text-sm" 
                  type="date" 
                  value={customEnd} 
                  onChange={e => setCustomEnd(e.target.value)} 
                />
              </div>
            </div>
          )}

          {/* Entry count - shows REAL total, not limited UI preview */}
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
            OPTIONEN CARD (Toggle-Listen-Stil) - Priorisiert für chron. Migräne
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="divide-y divide-border/50">
          {/* Section 1: Medikamente im PDF (höchste Priorität) */}
          <div className="p-4 space-y-2">
            <ToggleRow
              label="Medikamente im PDF"
              checked={allMedications}
              onCheckedChange={setAllMedications}
            />
            
            {!allMedications && medOptions.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Ausgewählt: {selectedMedIds.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {/* "Alle" chip at the front */}
                  <Button
                    type="button"
                    size="sm"
                    variant={allMedsSelected ? "default" : "outline"}
                    onClick={handleToggleAllMeds}
                    className="text-xs h-7 px-2.5 font-medium"
                  >
                    Alle
                  </Button>
                  {medOptions.map(m => {
                    const isSelected = selectedMedIds.includes(m);
                    return (
                      <Button
                        key={m}
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => {
                          setSelectedMedIds(prev => 
                            isSelected ? prev.filter(x => x !== m) : [...prev, m]
                          );
                        }}
                        className="text-xs h-7 px-2"
                      >
                        {m}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Arztdaten einbinden */}
          <div className="p-4">
            <ToggleRow
              label="Arztdaten einbinden"
              checked={includeDoctorData}
              onCheckedChange={setIncludeDoctorData}
            />
          </div>

          {/* Section 3: Einträge */}
          <div className="p-4">
            <ToggleRow
              label="Einträge"
              checked={includeEntriesList}
              onCheckedChange={setIncludeEntriesList}
            />
          </div>

          {/* Section: Weitere Optionen (Accordion) - standardmäßig eingeklappt */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <span>Weitere Optionen</span>
              {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4 space-y-0.5">
              <ToggleRow
                label="Statistiken & Diagramme"
                checked={includeStats}
                onCheckedChange={setIncludeStats}
              />
              <ToggleRow
                label="Auswertung"
                checked={includeAnalysis}
                onCheckedChange={setIncludeAnalysis}
              />
              <ToggleRow
                label="Therapien"
                checked={includeTherapies}
                onCheckedChange={setIncludeTherapies}
                disabled={medicationCourses.length === 0}
              />
              <ToggleRow
                label="Notizen aus Schmerzeinträgen"
                checked={includeEntryNotes}
                onCheckedChange={setIncludeEntryNotes}
              />
              <div className="border-t border-border/30 pt-2 mt-2">
                <ToggleRow
                  label="Kontextnotizen"
                  checked={includeContextNotes}
                  onCheckedChange={setIncludeContextNotes}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Premium Section: KI-Analysebericht - Ruhig & migränefreundlich */}
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
            
            {/* Status Display - Minimal */}
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
          disabled={!filteredEntries.length || isGeneratingReport}
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

        {/* Secondary actions - less prominent */}
        <div className="flex justify-center gap-4">
          <Button 
            onClick={exportCSV}
            disabled={!filteredEntries.length || isGeneratingReport}
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <Table className="mr-1.5 h-3.5 w-3.5" />
            CSV exportieren
          </Button>

          <Button 
            onClick={generateMedicationPlanPdf}
            disabled={medicationCourses.length === 0 || isGeneratingMedPlan || isGeneratingReport}
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {isGeneratingMedPlan ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pill className="mr-1.5 h-3.5 w-3.5" />
            )}
            Medikationsplan
          </Button>

          <Button 
            onClick={() => onNavigate?.('hit6')}
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            HIT-6 (PDF)
          </Button>
        </div>
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
