import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { PainEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { buildDiaryPdf } from "@/lib/pdf/report";
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan";
import { getUserSettings, upsertUserSettings } from "@/features/settings/api/settings.api";
import { mapTextLevelToScore } from "@/lib/utils/pain";
import { useMedicationEffectsForEntries } from "@/features/medication-effects/hooks/useMedicationEffects";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import MedicationStatisticsCard from "./MedicationStatisticsCard";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import { Loader2, ArrowLeft, FileText, Table, Pill, Plus, Edit, UserPlus, User, Info, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { devLog, devWarn } from "@/lib/utils/devLogger";

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

export default function DiaryReport({ onBack, onNavigate }: { onBack: () => void; onNavigate?: (target: string) => void }) {
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<Preset>("3m");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>(fmt(today));
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [medOptions, setMedOptions] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState<string>("");
  
  // Content inclusion flags
  const [includeStats, setIncludeStats] = useState<boolean>(true);
  const [includeChart, setIncludeChart] = useState<boolean>(true);
  const [includeAnalysis, setIncludeAnalysis] = useState<boolean>(true);
  const [includeEntriesList, setIncludeEntriesList] = useState<boolean>(true);
  const [includePatientData, setIncludePatientData] = useState<boolean>(true);
  const [includeDoctorData, setIncludeDoctorData] = useState<boolean>(false);
  const [includeMedicationCourses, setIncludeMedicationCourses] = useState<boolean>(true);
  const [includePatientNotes, setIncludePatientNotes] = useState<boolean>(true);
  const [patientNotes, setPatientNotes] = useState<string>("");
  
  const [freeTextExportMode, setFreeTextExportMode] = useState<'none' | 'short_notes' | 'notes_and_context'>('none');
  
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([]);
  const [doctorPreferencesLoaded, setDoctorPreferencesLoaded] = useState(false);
  
  const [generated, setGenerated] = useState<PainEntry[]>([]);
  const [previousSelection, setPreviousSelection] = useState<string[]>([]);
  const [allSelected, setAllSelected] = useState<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [analysisReport, setAnalysisReport] = useState<string>("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isGeneratingMedPlan, setIsGeneratingMedPlan] = useState(false);
  const [showMissingDataDialog, setShowMissingDataDialog] = useState(false);
  const [showDoctorSelection, setShowDoctorSelection] = useState(false);
  const [pendingPdfType, setPendingPdfType] = useState<"diary" | "medplan" | null>(null);

  // UI State for collapsibles
  const [filterOpen, setFilterOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const { data: patientData } = usePatientData();
  const { data: doctors = [] } = useDoctors();
  const { data: medicationCourses = [] } = useMedicationCourses();

  // Initialize collapsible states based on data
  useEffect(() => {
    if (selectedMeds.length > 0) setFilterOpen(true);
    if (patientNotes.trim()) setNotesOpen(true);
  }, []);

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
          if (settings.default_report_preset && (["3m","6m","12m","custom"] as const).includes(settings.default_report_preset as any)) {
            setPreset(settings.default_report_preset as Preset);
          }
          if (settings.selected_medications && Array.isArray(settings.selected_medications)) {
            setSelectedMeds(settings.selected_medications);
            if (settings.selected_medications.length > 0) setFilterOpen(true);
          }
          if (settings.include_statistics !== null) setIncludeStats(settings.include_statistics);
          if (settings.include_chart !== null) setIncludeChart(settings.include_chart);
          if (settings.include_ai_analysis !== null) setIncludeAnalysis(settings.include_ai_analysis);
          if (settings.include_entries_list !== null) setIncludeEntriesList(settings.include_entries_list);
          if (settings.include_patient_data !== null) setIncludePatientData(settings.include_patient_data);
          
          const lastIncludeDoctors = (settings as any).last_include_doctors_flag;
          const lastDoctorIds = (settings as any).last_doctor_export_ids;
          
          if (typeof lastIncludeDoctors === 'boolean') {
            setIncludeDoctorData(lastIncludeDoctors);
          }
          if (Array.isArray(lastDoctorIds) && lastDoctorIds.length > 0) {
            setSelectedDoctorIds(lastDoctorIds);
          }
        }
        setDoctorPreferencesLoaded(true);
      } catch (error) {
        console.error("Error loading report settings:", error);
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

  const selectedDoctorsForExport = useMemo(() => {
    if (!includeDoctorData) return [];
    if (doctors.length === 1) return doctors;
    return doctors.filter(d => d.id && selectedDoctorIds.includes(d.id));
  }, [doctors, selectedDoctorIds, includeDoctorData]);

  const { from, to } = useMemo(() => {
    if (preset === "custom" && customStart && customEnd) {
      return { from: customStart, to: customEnd };
    }
    const end = fmt(today);
    const start =
      preset === "3m" ? fmt(addMonths(new Date(today), -3)) :
      preset === "6m" ? fmt(addMonths(new Date(today), -6)) :
      fmt(addMonths(new Date(today), -12));
    return { from: start, to: end };
  }, [preset, customStart, customEnd, today]);

  const { data: entries = [], isLoading } = useEntries({ from, to });
  const entryIds = useMemo(() => entries.map(e => Number(e.id)), [entries]);
  const { data: medicationEffects = [] } = useMedicationEffectsForEntries(entryIds);

  // Save report settings (debounced)
  useEffect(() => {
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
            selected_medications: selectedMeds,
            include_statistics: includeStats,
            include_chart: includeChart,
            include_ai_analysis: includeAnalysis,
            include_entries_list: includeEntriesList,
            include_patient_data: includePatientData,
            include_doctor_data: includeDoctorData,
            last_include_doctors_flag: includeDoctorData,
            last_doctor_export_ids: selectedDoctorIds,
          }, { onConflict: "user_id" });
      } catch (error) {
        console.error("Error saving report settings:", error);
      }
    }, 1000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [selectedMeds, includeStats, includeChart, includeAnalysis, includeEntriesList, includePatientData, includeDoctorData, selectedDoctorIds]);

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

  const filteredEntries = useMemo(() => {
    if (selectedMeds.length === 0) {
      return entries;
    }
    const medsSet = new Set(selectedMeds);
    return entries.filter(e => {
      const meds = e.medications || [];
      return meds.some(m => medsSet.has(m)) || meds.length === 0;
    });
  }, [entries, selectedMeds]);

  const avgPain = useMemo(() => {
    if (!filteredEntries.length) return 0;
    const validEntries = filteredEntries.filter(e => {
      const score = mapTextLevelToScore(e.pain_level);
      return score > 0;
    });
    if (!validEntries.length) return 0;
    const sum = validEntries.reduce((s, e) => s + mapTextLevelToScore(e.pain_level), 0);
    return (sum / validEntries.length).toFixed(2);
  }, [filteredEntries]);

  const medicationStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalEffect: number; ratedCount: number }>();
    
    filteredEntries.forEach(entry => {
      entry.medications?.forEach(med => {
        if (!stats.has(med)) {
          stats.set(med, { count: 0, totalEffect: 0, ratedCount: 0 });
        }
        const s = stats.get(med)!;
        s.count++;
        
        const effect = medicationEffects.find(e => 
          e.entry_id === Number(entry.id) && e.med_name === med
        );
        
        if (effect) {
          s.totalEffect += mapEffectToNumber(effect.effect_rating);
          s.ratedCount++;
        }
      });
    });
    
    return Array.from(stats.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      avgEffect: data.ratedCount > 0 ? data.totalEffect / data.ratedCount : null,
      ratedCount: data.ratedCount
    }));
  }, [filteredEntries, medicationEffects]);

  const formatGermanDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  };

  const actuallyGenerateDiaryPDF = async (selectedDoctors: Doctor[]) => {
    setIsGeneratingReport(true);
    
    try {
      devLog('PDF Generierung gestartet', { 
        context: 'DiaryReport',
        data: { from, to, entriesCount: filteredEntries.length, includeAnalysis, includeStats, includeChart, includeEntriesList, includePatientData, includeDoctorData }
      });

      let aiAnalysis = undefined;
      
      if (includeAnalysis) {
        try {
          const { data, error } = await supabase.functions.invoke('generate-doctor-summary', {
            body: { 
              fromDate: `${from}T00:00:00Z`, 
              toDate: `${to}T23:59:59Z`
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

      const pdfBytes = await buildDiaryPdf({
        title: "Kopfschmerztagebuch",
        from,
        to,
        entries: filteredEntries,
        selectedMeds,
        
        includeStats,
        includeChart,
        includeAnalysis: includeAnalysis && !!aiAnalysis,
        includeEntriesList,
        includePatientData,
        includeDoctorData,
        includeMedicationCourses,
        includePatientNotes: includePatientNotes && !!patientNotes.trim(),
        freeTextExportMode,
        
        analysisReport: aiAnalysis,
        patientNotes: includePatientNotes ? patientNotes : "",
        medicationStats: medicationStats,
        medicationCourses: includeMedicationCourses ? medicationCourses.map(c => ({
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

      console.log("PDF erfolgreich generiert, Größe:", pdfBytes.byteLength, "bytes");

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

  const generatePDF = async () => {
    if (!filteredEntries.length) {
      toast.error("Keine Einträge im ausgewählten Zeitraum");
      return;
    }

    if (!from || !to) {
      console.error("PDF Generierung - Ungültige Daten:", { from, to });
      toast.error("Zeitraum ist nicht korrekt definiert.");
      return;
    }

    if (includePatientData && !patientData?.first_name && !patientData?.last_name) {
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
      
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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

  return (
    <TooltipProvider delayDuration={300}>
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button 
          variant="ghost" 
          onClick={onBack} 
          className="p-2 hover:bg-secondary/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold flex-1">Kopfschmerztagebuch (PDF)</h1>
      </div>

      <div className="p-4 space-y-4">

        {/* ═══════════════════════════════════════════════════════════════════
            BLOCK 1: ZEITRAUM
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Zeitraum</h3>
          <TimeRangeButtons value={preset} onChange={setPreset} />

          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm mb-1">Start</label>
                <input className="border-border/30 border rounded px-2 h-10 w-full bg-background text-foreground" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">Ende</label>
                <input className="border-border/30 border rounded px-2 h-10 w-full bg-background text-foreground" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            </div>
          )}

          {/* Entry summary directly under time range */}
          <div className="text-sm text-muted-foreground">
            {filteredEntries.length > 0 ? (
              <span>
                <span className="font-semibold text-foreground">{filteredEntries.length}</span> Einträge 
                {" "}({format(new Date(from), 'dd.MM.yyyy')} – {format(new Date(to), 'dd.MM.yyyy')})
              </span>
            ) : (
              <span className="text-destructive">Keine Einträge im Zeitraum</span>
            )}
          </div>

          {/* Filter (collapsible) */}
          <Collapsible open={filterOpen} onOpenChange={setFilterOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              {filterOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>Filter (optional)</span>
              {selectedMeds.length > 0 && !filterOpen && (
                <span className="text-primary">• {selectedMeds.length} Medikamente</span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Nur ausgewählte Medikamente im PDF</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Wenn du bestimmte Medikamente auswählst, werden nur Einträge angezeigt, bei denen diese Medikamente dokumentiert wurden. Standard: alle Medikamente.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={allSelected ? "default" : "outline"}
                  onClick={() => {
                    if (allSelected) {
                      setSelectedMeds(previousSelection);
                      setAllSelected(false);
                    } else {
                      setPreviousSelection(selectedMeds);
                      setSelectedMeds([...medOptions]);
                      setAllSelected(true);
                    }
                  }}
                  className="text-xs font-semibold"
                >
                  Alle
                </Button>
                {medOptions.map(m => {
                  const isSelected = selectedMeds.includes(m);
                  return (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => {
                        setSelectedMeds(prev => isSelected ? prev.filter(x=>x!==m) : [...prev, m]);
                        setAllSelected(false);
                      }}
                      aria-pressed={isSelected}
                      className="text-xs"
                    >
                      {m}
                    </Button>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            BLOCK 2: INHALT
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-semibold">Inhalt</h3>
          
          {/* Hauptoptionen */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <Checkbox 
                checked={includeStats && includeChart} 
                onCheckedChange={(checked) => {
                  setIncludeStats(!!checked);
                  setIncludeChart(!!checked);
                }} 
              />
              <span className="font-medium">Statistiken & Diagramme</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Zeigt Frequenz und Wirksamkeit deiner Medikamente sowie den Verlauf der Schmerzstärke in Diagrammen.
                </TooltipContent>
              </Tooltip>
            </label>
            
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <Checkbox 
                checked={includeAnalysis} 
                onCheckedChange={(checked) => {
                  setIncludeAnalysis(!!checked);
                  if (!checked) setAnalysisReport("");
                }} 
              />
              <span className="font-medium">KI-Analyse</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Erkennt mögliche Muster und Auffälligkeiten in deinen Daten. Hinweis: Dies ist keine medizinische Diagnose und ersetzt keine ärztliche Beratung.
                </TooltipContent>
              </Tooltip>
            </label>
            
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <Checkbox 
                checked={includeEntriesList} 
                onCheckedChange={(checked) => setIncludeEntriesList(!!checked)} 
              />
              <span className="font-medium">Einträge (Tabelle)</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Alle einzelnen Kopfschmerz-Einträge in Tabellenform. Ideal für Arzttermine.
                </TooltipContent>
              </Tooltip>
            </label>
          </div>

          {/* Weitere Inhalte */}
          <div className="pt-3 border-t space-y-3">
            <span className="text-xs text-muted-foreground">Weitere Inhalte</span>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">Therapien (Prophylaxe & Akut)</span>
                {medicationCourses.length === 0 && (
                  <span className="text-xs text-muted-foreground">(keine)</span>
                )}
              </div>
              <Switch 
                checked={includeMedicationCourses} 
                onCheckedChange={setIncludeMedicationCourses}
                disabled={medicationCourses.length === 0}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">Persönliche Daten</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Deaktiviere diese Option, wenn du das Tagebuch anonym teilen möchtest.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch 
                checked={includePatientData} 
                onCheckedChange={setIncludePatientData}
              />
            </div>
            
            {/* Arztangaben inline */}
            {doctors.length === 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Arztangaben</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate('settings-doctors?origin=export_migraine_diary');
                    }
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Hinzufügen
                </Button>
              </div>
            ) : doctors.length === 1 ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Arztangaben</span>
                  <span className="text-xs text-muted-foreground">
                    ({[doctors[0]?.title, doctors[0]?.first_name, doctors[0]?.last_name].filter(Boolean).join(' ')})
                  </span>
                </div>
                <Switch
                  checked={includeDoctorData}
                  onCheckedChange={(checked) => {
                    setIncludeDoctorData(checked);
                    if (checked && doctors[0]?.id) {
                      setSelectedDoctorIds([doctors[0].id]);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Arztangaben</span>
                  <span className="text-xs text-muted-foreground">
                    {selectedDoctorIds.length === 0 ? 'Keine ausgewählt' : `${selectedDoctorIds.length} ausgewählt`}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {doctors.map((doctor) => {
                    const isSelected = doctor.id ? selectedDoctorIds.includes(doctor.id) : false;
                    return (
                      <div
                        key={doctor.id}
                        className="flex items-center gap-2 p-2 rounded bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors"
                        onClick={() => {
                          if (!doctor.id) return;
                          setSelectedDoctorIds(prev => 
                            isSelected ? prev.filter(id => id !== doctor.id) : [...prev, doctor.id!]
                          );
                          if (!isSelected && !includeDoctorData) {
                            setIncludeDoctorData(true);
                          }
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {}}
                          className="shrink-0"
                        />
                        <span className="text-sm flex-1">
                          {[doctor.title, doctor.first_name, doctor.last_name].filter(Boolean).join(' ') || 'Unbekannt'}
                          {doctor.specialty && <span className="text-muted-foreground ml-1">({doctor.specialty})</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            BLOCK 3: NOTIZEN & ANMERKUNGEN
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-semibold">Notizen</h3>
          
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm cursor-pointer p-2 rounded-lg border border-border/50 hover:border-primary/30 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
              <input 
                type="radio" 
                name="freeTextMode" 
                value="none"
                checked={freeTextExportMode === 'none'} 
                onChange={() => setFreeTextExportMode('none')}
                className="accent-primary"
              />
              <span className="font-medium">Keine Notizen</span>
              <span className="text-xs text-muted-foreground">(empfohlen)</span>
            </label>
            
            <label className="flex items-center gap-3 text-sm cursor-pointer p-2 rounded-lg border border-border/50 hover:border-primary/30 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
              <input 
                type="radio" 
                name="freeTextMode" 
                value="short_notes"
                checked={freeTextExportMode === 'short_notes'} 
                onChange={() => setFreeTextExportMode('short_notes')}
                className="accent-primary"
              />
              <span className="font-medium">Kurze Notizen</span>
            </label>
            
            <label className="flex items-center gap-3 text-sm cursor-pointer p-2 rounded-lg border border-border/50 hover:border-primary/30 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
              <input 
                type="radio" 
                name="freeTextMode" 
                value="notes_and_context"
                checked={freeTextExportMode === 'notes_and_context'} 
                onChange={() => setFreeTextExportMode('notes_and_context')}
                className="accent-primary"
              />
              <span className="font-medium">Notizen + Anhang</span>
            </label>

            {/* Kontextuelle Beschreibung nur für ausgewählte Option */}
            {freeTextExportMode !== 'none' && (
              <p className="text-xs text-muted-foreground pl-2 mt-1">
                {freeTextExportMode === 'short_notes' 
                  ? 'Kurze Notizen in der Einträge-Tabelle anzeigen.'
                  : 'Kurze Notizen + ausführlicher Kontext-Anhang am Ende.'}
              </p>
            )}
          </div>

          {/* Anmerkungen (Accordion) */}
          <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1 w-full">
              {notesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>Anmerkungen (optional)</span>
              {patientNotes.trim() && !notesOpen && (
                <span className="text-primary text-xs">• vorhanden</span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <textarea
                value={patientNotes}
                onChange={e => {
                  const newValue = e.target.value.slice(0, 1000);
                  setPatientNotes(newValue);
                  if (newValue.trim() && !includePatientNotes) {
                    setIncludePatientNotes(true);
                  }
                }}
                placeholder="Hinweise/Fragen für den Arzt..."
                className="w-full min-h-[80px] max-h-[150px] p-3 text-sm border border-border/50 rounded-md bg-background resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                rows={3}
              />
              <div className="flex justify-between items-center">
                {patientNotes.trim() && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox 
                      checked={includePatientNotes} 
                      onCheckedChange={(checked) => setIncludePatientNotes(!!checked)} 
                      className="h-3 w-3"
                    />
                    Im PDF anzeigen
                  </label>
                )}
                <span className={`text-xs ml-auto ${patientNotes.length > 900 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {patientNotes.length}/1000
                </span>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            EXPORT BEREICH
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="p-4 space-y-3">
          <Button 
            onClick={generatePDF}
            disabled={!filteredEntries.length || isGeneratingReport}
            size="lg"
            className="w-full"
          >
            {isGeneratingReport ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                PDF wird erstellt...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-5 w-5" />
                PDF erstellen{filteredEntries.length > 0 ? ` (${filteredEntries.length})` : ''}
              </>
            )}
          </Button>

          <div className="flex gap-2">
            <Button 
              onClick={exportCSV}
              disabled={!filteredEntries.length || isGeneratingReport}
              variant="outline"
              className="flex-1"
              size="sm"
            >
              <Table className="mr-2 h-4 w-4" />
              CSV
            </Button>

            <Button 
              onClick={generateMedicationPlanPdf}
              disabled={medicationCourses.length === 0 || isGeneratingMedPlan || isGeneratingReport}
              variant="outline"
              className="flex-1"
              size="sm"
            >
              {isGeneratingMedPlan ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Pill className="mr-2 h-4 w-4" />
              )}
              Medikationsplan
            </Button>
          </div>
        </Card>
      </div>

      {/* Missing Data Dialog */}
      <AlertDialog open={showMissingDataDialog} onOpenChange={setShowMissingDataDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Daten nicht vorhanden</AlertDialogTitle>
            <AlertDialogDescription>
              Sie haben noch keine persönlichen Daten oder Arztdaten hinterlegt. 
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
          setIncludeDoctorData(newIds.length > 0);
          handleDoctorSelectionConfirm(selected);
        }}
        preSelectedIds={selectedDoctorIds}
        title={pendingPdfType === "diary" ? "Arzt für Kopfschmerztagebuch auswählen" : "Arzt für Medikationsplan auswählen"}
        description="Wählen Sie die Ärzte aus, deren Kontaktdaten im PDF erscheinen sollen."
      />
    </div>
    </TooltipProvider>
  );
}
