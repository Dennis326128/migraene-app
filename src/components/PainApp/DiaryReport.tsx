import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PainEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { buildDiaryPdf } from "@/lib/pdf/report";
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan";
import { mapTextLevelToScore } from "@/lib/utils/pain";
import { useMedicationEffectsForEntries } from "@/features/medication-effects/hooks/useMedicationEffects";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { Loader2, ArrowLeft, FileText, Table, Pill, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { TimeRangeButtons, type TimeRangePreset } from "./TimeRangeButtons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DoctorSelectionDialog, type Doctor } from "./DoctorSelectionDialog";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { devLog, devWarn } from "@/lib/utils/devLogger";
import { buildReportData, type ReportData, getEntryDate } from "@/lib/pdf/reportData";

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
  const today = useMemo(() => new Date(), []);
  
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
  const [showMissingDataDialog, setShowMissingDataDialog] = useState(false);
  const [showDoctorSelection, setShowDoctorSelection] = useState(false);
  const [pendingPdfType, setPendingPdfType] = useState<"diary" | "medplan" | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { data: patientData } = usePatientData();
  const { data: doctors = [] } = useDoctors();
  const { data: medicationCourses = [] } = useMedicationCourses();

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
            include_ai_analysis: includeAnalysis,
            include_entries_list: includeEntriesList,
            include_medication_summary: includeTherapies,
            include_patient_data: true, // Always included
            include_doctor_data: includeDoctorData,
            include_all_medications: allMedications,
            selected_medications: selectedMedIds,
            last_include_doctors_flag: includeDoctorData,
            last_doctor_export_ids: selectedDoctorIds,
          }, { onConflict: "user_id" });
      } catch (error) {
        console.error("Error saving report settings:", error);
      }
    }, 400);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [settingsLoaded, preset, includeStats, includeAnalysis, includeEntriesList, includeTherapies, includeDoctorData, allMedications, selectedMedIds, selectedDoctorIds]);

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
    if (doctors.length === 1) return doctors;
    return doctors.filter(d => d.id && selectedDoctorIds.includes(d.id));
  }, [doctors, selectedDoctorIds, includeDoctorData]);

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

  // PDF Generation
  const actuallyGenerateDiaryPDF = async (selectedDoctors: Doctor[]) => {
    setIsGeneratingReport(true);
    
    try {
      // SANITY CHECK 1: Konsistenz prüfen
      if (import.meta.env.DEV && reportData) {
        console.log('[DiaryReport] Sanity Check:', {
          entriesCount: entries.length,
          reportDataAttacks: reportData.kpis.totalAttacks,
          fromDate: from,
          toDate: to,
          reportDataFrom: reportData.fromDate,
          reportDataTo: reportData.toDate
        });
        
        if (entries.length !== reportData.kpis.totalAttacks) {
          console.warn('[DiaryReport] INKONSISTENZ: entries.length !== reportData.kpis.totalAttacks');
        }
      }
      
      devLog('PDF Generierung gestartet', { 
        context: 'DiaryReport',
        data: { from, to, entriesCount: entries.length, reportDataAttacks: reportData?.kpis.totalAttacks }
      });

      let aiAnalysis = undefined;
      
      if (includeAnalysis) {
        try {
          // OPTION A: Übergebe kompakte Entry-Daten an Edge Function für Konsistenz
          const entryPayload = entries.map(e => ({
            id: e.id,
            date: getEntryDate(e),
            time: e.selected_time || '',
            pain_level: e.pain_level,
            aura_type: e.aura_type,
            pain_location: e.pain_location,
            medications: e.medications || [],
            notes: e.notes?.substring(0, 200) // Gekürzt um Payload klein zu halten
          }));
          
          const { data, error } = await supabase.functions.invoke('generate-doctor-summary', {
            body: { 
              fromDate: `${from}T00:00:00Z`, 
              toDate: `${to}T23:59:59Z`,
              includeContextNotes: includeContextNotes,
              // Neue Felder für konsistente Daten
              totalAttacks: reportData?.kpis.totalAttacks || entries.length,
              daysInRange: reportData?.kpis.daysInRange || 1
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

      // Determine freeTextExportMode based on toggle
      const freeTextMode = includeContextNotes ? 'notes_and_context' : (includeEntryNotes ? 'short_notes' : 'none');

      // WICHTIG: Für PDF verwenden wir ALLE entries (nicht filteredEntries) für konsistente KPIs
      const pdfBytes = await buildDiaryPdf({
        title: "Kopfschmerztagebuch",
        from,
        to,
        entries: entries, // ALLE entries für konsistente Attackenzahl
        selectedMeds: allMedications ? [] : selectedMedIds,
        
        includeStats,
        includeChart: includeStats,
        includeAnalysis: includeAnalysis && !!aiAnalysis,
        includeEntriesList,
        includePatientData: true, // Always include
        includeDoctorData: includeDoctorData && selectedDoctors.length > 0,
        includeMedicationCourses: includeTherapies,
        includePatientNotes: false,
        freeTextExportMode: freeTextMode as any,
        
        analysisReport: aiAnalysis,
        patientNotes: "",
        medicationStats: medicationStats,
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
        patientData: patientData ? {
          firstName: patientData.first_name || "",
          lastName: patientData.last_name || "",
          street: patientData.street || "",
          postalCode: patientData.postal_code || "",
          city: patientData.city || "",
          phone: patientData.phone || "",
          fax: patientData.fax || "",
          email: userEmail || "",
          dateOfBirth: patientData.date_of_birth || ""
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
        })) : undefined
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

  const generatePDF = async () => {
    if (!filteredEntries.length) {
      toast.error("Keine Einträge im ausgewählten Zeitraum");
      return;
    }

    // Patient data is always included, so check if it exists
    if (!patientData?.first_name && !patientData?.last_name) {
      setShowMissingDataDialog(true);
      return;
    }

    if (includeDoctorData && doctors.length > 1) {
      setPendingPdfType("diary");
      setShowDoctorSelection(true);
      return;
    }

    await actuallyGenerateDiaryPDF(selectedDoctorsForExport);
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

          {/* Entry count */}
          <div className="text-sm text-muted-foreground pt-1">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Lade Einträge...
              </span>
            ) : filteredEntries.length > 0 ? (
              <span>
                <span className="font-medium text-foreground">{filteredEntries.length}</span> Einträge 
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
              subtext={allMedications ? "Alle Medikamente werden einbezogen" : "Auswahl treffen"}
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
              subtext="Name, Adresse, Kontaktdaten des Arztes"
            />
          </div>

          {/* Section 3: Einträge (Tabelle) */}
          <div className="p-4">
            <ToggleRow
              label="Einträge (Tabelle)"
              checked={includeEntriesList}
              onCheckedChange={setIncludeEntriesList}
            />
          </div>

          {/* Section: Weitere Optionen (Accordion) - standardmäßig eingeklappt */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <div className="flex items-center gap-2">
                <span>Weitere Optionen</span>
                {/* Badge wenn Optionen von Default abweichen */}
                {(() => {
                  const hasChanges = 
                    !includeStats || 
                    !includeAnalysis || 
                    !includeTherapies || 
                    !includeEntryNotes || 
                    includeContextNotes;
                  return hasChanges ? (
                    <span className="text-xs text-primary">• geändert</span>
                  ) : null;
                })()}
              </div>
              {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4 space-y-0.5">
              <ToggleRow
                label="Statistiken & Diagramme"
                checked={includeStats}
                onCheckedChange={setIncludeStats}
              />
              <ToggleRow
                label="KI-Analyse"
                checked={includeAnalysis}
                onCheckedChange={setIncludeAnalysis}
              />
              <ToggleRow
                label="Therapien (Prophylaxe & Akut)"
                checked={includeTherapies}
                onCheckedChange={setIncludeTherapies}
                disabled={medicationCourses.length === 0}
                subtext={medicationCourses.length === 0 ? "Keine Therapien vorhanden" : undefined}
              />
              <ToggleRow
                label="Notizen aus Schmerzeinträgen"
                checked={includeEntryNotes}
                onCheckedChange={setIncludeEntryNotes}
              />
              <div className="border-t border-border/30 pt-2 mt-2">
                <ToggleRow
                  label="Alle Kontextnotizen einbinden"
                  checked={includeContextNotes}
                  onCheckedChange={setIncludeContextNotes}
                  subtext="Zusätzliche Kontext-/Systemnotizen (kann PDF verlängern und beeinflusst KI-Analyse)"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
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
        </div>
      </div>

      {/* Missing Data Dialog */}
      <AlertDialog open={showMissingDataDialog} onOpenChange={setShowMissingDataDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Daten nicht vorhanden</AlertDialogTitle>
            <AlertDialogDescription>
              Sie haben noch keine persönlichen Daten hinterlegt. 
              Möchten Sie diese jetzt in den Kontoeinstellungen eingeben?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowMissingDataDialog(false);
                if (onNavigate) {
                  onNavigate('settings-account');
                }
              }}
            >
              Zu Kontoeinstellungen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
