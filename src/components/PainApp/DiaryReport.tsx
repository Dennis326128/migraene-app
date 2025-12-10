import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { PainEntry } from "@/types/painApp";
import { useEntries } from "@/features/entries/hooks/useEntries";
import { buildDiaryPdf } from "@/lib/pdf/report"; // ← STANDARD-REPORT für Krankenkasse/Ärzte
import { buildMedicationPlanPdf } from "@/lib/pdf/medicationPlan"; // ← BMP-STYLE MEDIKATIONSPLAN
import { getUserSettings, upsertUserSettings } from "@/features/settings/api/settings.api";
import { mapTextLevelToScore } from "@/lib/utils/pain";
import { useMedicationEffectsForEntries } from "@/features/medication-effects/hooks/useMedicationEffects";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import MedicationStatisticsCard from "./MedicationStatisticsCard";
import TimeSeriesChart from "@/components/TimeSeriesChart";
import { Loader2, ArrowLeft, FileText, Table, Pill, Plus, Edit, UserPlus, User } from "lucide-react";
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

/**
 * DiaryReport - PDF-Export-Komponente für Kopfschmerztagebuch
 * 
 * Flow:
 * 1. User wählt Zeitraum, Medikamente und Inhalte (Checkboxen)
 * 2. Daten werden aus Supabase geladen (pain_entries, medication_effects, patient_data, doctors)
 * 3. Bei PDF-Erstellung wird buildDiaryPdf() aus src/lib/pdf/report.ts aufgerufen
 * 4. Optional: Kurzer Arzt-KI-Bericht via generate-doctor-summary Edge Function
 * 5. PDF wird als Blob heruntergeladen
 * 
 * ✅ AKTIVE PDF-GENERIERUNG: buildDiaryPdf (src/lib/pdf/report.ts)
 * 
 * Features:
 * - Deutsche Datumsformate (dd.mm.yyyy, dd.mm.yyyy HH:mm)
 * - Patientendaten-Sektion (checkbox-gesteuert)
 * - Arztkontakte-Sektion (checkbox-gesteuert)
 * - KI-Analyse für Ärzte (kurzer Arztbericht, checkbox-gesteuert)
 * - Executive Summary mit Statistiken
 * - Professionelle Tabellen und Charts
 */

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
  const [includeDoctorData, setIncludeDoctorData] = useState<boolean>(false); // Default: false until user decides
  const [includeMedicationCourses, setIncludeMedicationCourses] = useState<boolean>(true);
  const [includePatientNotes, setIncludePatientNotes] = useState<boolean>(true);
  const [patientNotes, setPatientNotes] = useState<string>("");
  
  // Free text export mode: 'none' | 'short_notes' | 'notes_and_context'
  const [freeTextExportMode, setFreeTextExportMode] = useState<'none' | 'short_notes' | 'notes_and_context'>('none');
  
  // Doctor selection state
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

  // Load report settings from database (including doctor preferences)
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
          // Load time range
          if (settings.default_report_preset && (["3m","6m","12m","custom"] as const).includes(settings.default_report_preset as any)) {
            setPreset(settings.default_report_preset as Preset);
          }
          
          // Load medication selection
          if (settings.selected_medications && Array.isArray(settings.selected_medications)) {
            setSelectedMeds(settings.selected_medications);
          }
          
          // Load content inclusion flags
          if (settings.include_statistics !== null) setIncludeStats(settings.include_statistics);
          if (settings.include_chart !== null) setIncludeChart(settings.include_chart);
          if (settings.include_ai_analysis !== null) setIncludeAnalysis(settings.include_ai_analysis);
          if (settings.include_entries_list !== null) setIncludeEntriesList(settings.include_entries_list);
          if (settings.include_patient_data !== null) setIncludePatientData(settings.include_patient_data);
          
          // Load doctor export preferences
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

  // Initialize doctor selection when doctors load and preferences are loaded
  useEffect(() => {
    if (!doctorPreferencesLoaded || doctors.length === 0) return;
    
    // If we have saved doctor IDs, filter them to only include existing doctors
    if (selectedDoctorIds.length > 0) {
      const existingDoctorIds = doctors.map(d => d.id).filter(Boolean) as string[];
      const validSelectedIds = selectedDoctorIds.filter(id => existingDoctorIds.includes(id));
      
      if (validSelectedIds.length !== selectedDoctorIds.length) {
        setSelectedDoctorIds(validSelectedIds);
      }
      
      // If we have valid selections, enable doctor data
      if (validSelectedIds.length > 0 && !includeDoctorData) {
        // Keep user's preference
      }
    } else if (doctors.length > 0 && includeDoctorData) {
      // If include doctor data is true but no IDs selected, select all doctors
      setSelectedDoctorIds(doctors.map(d => d.id).filter(Boolean) as string[]);
    }
  }, [doctors, doctorPreferencesLoaded]);

  // Derive actual doctor selection based on state
  const selectedDoctorsForExport = useMemo(() => {
    if (!includeDoctorData) return [];
    if (doctors.length === 1) return doctors;
    return doctors.filter(d => d.id && selectedDoctorIds.includes(d.id));
  }, [doctors, selectedDoctorIds, includeDoctorData]);

  // berechneter Zeitraum
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

  // Einträge laden
  const { data: entries = [], isLoading } = useEntries({ from, to });

  // Medication effects für Statistiken laden
  const entryIds = useMemo(() => entries.map(e => Number(e.id)), [entries]);
  const { data: medicationEffects = [] } = useMedicationEffectsForEntries(entryIds);

  // Save all report settings to database (debounced) - including doctor preferences
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

  // Medikamenten-Optionen (aus user_medications, Fallback: aus Einträgen)
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
        // Fallback: aus Einträgen ableiten
        const uniq = new Set<string>();
        entries.forEach(e => (e.medications || []).forEach(m => uniq.add(m)));
        setMedOptions(Array.from(uniq).sort());
      }
    })();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    // Wenn keine Medikamente ausgewählt: ALLE Einträge zurückgeben
    if (selectedMeds.length === 0) {
      return entries;
    }
    
    // Wenn Medikamente ausgewählt: Einträge mit diesen Medikamenten ODER ohne Medikamente (immer einbeziehen)
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
      return score > 0; // Exclude zero values from average
    });
    if (!validEntries.length) return 0;
    const sum = validEntries.reduce((s, e) => s + mapTextLevelToScore(e.pain_level), 0);
    return (sum / validEntries.length).toFixed(2);
  }, [filteredEntries]);

  // Medikamenten-Statistiken berechnen
  const medicationStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalEffect: number; ratedCount: number }>();
    
    filteredEntries.forEach(entry => {
      entry.medications?.forEach(med => {
        if (!stats.has(med)) {
          stats.set(med, { count: 0, totalEffect: 0, ratedCount: 0 });
        }
        const s = stats.get(med)!;
        s.count++;
        
        // Finde Wirkung für dieses Medikament in diesem Eintrag
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
      console.log("PDF Generierung gestartet:", { 
        from, 
        to, 
        entriesCount: filteredEntries.length,
        includeAnalysis,
        includeStats,
        includeChart,
        includeEntriesList,
        includePatientData,
        includeDoctorData
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
          console.warn("KI-Analyse übersprungen:", err);
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
      
      // Sicheres Date Formatting für Dateinamen
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

    // Pre-PDF Validierung
    if (!from || !to) {
      console.error("PDF Generierung - Ungültige Daten:", { from, to });
      toast.error("Zeitraum ist nicht korrekt definiert.");
      return;
    }

    if (includePatientData && !patientData?.first_name && !patientData?.last_name) {
      setShowMissingDataDialog(true);
      return;
    }

    // For multiple doctors, show selection dialog
    if (includeDoctorData && doctors.length > 1) {
      setPendingPdfType("diary");
      setShowDoctorSelection(true);
      return;
    }

    // Use the derived selectedDoctorsForExport
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

  // Generate BMP-style Medication Plan PDF
  const generateMedicationPlanPdf = async () => {
    if (medicationCourses.length === 0) {
      toast.error("Keine Medikamentenverläufe vorhanden");
      return;
    }

    // If multiple doctors, show selection dialog
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

        {/* Block 1: Zeitraum */}
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold mb-1">Zeitraum</h3>
            <p className="text-xs text-muted-foreground mb-3">Wähle, für welchen Zeitraum das Kopfschmerztagebuch erstellt werden soll.</p>
            <TimeRangeButtons value={preset} onChange={setPreset} />
          </div>

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
        </Card>

        {/* Block 2: Medikamenten-Fokus */}
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold mb-1">Medikamenten-Fokus (optional)</h3>
            <p className="text-xs text-muted-foreground mb-3">Wenn du willst, kannst du das Tagebuch auf bestimmte Medikamente fokussieren. Standard: alle Medikamente.</p>
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
        </Card>

        {/* Block 3: Inhalte des Tagebuchs */}
        <Card className="p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">Was soll ins Tagebuch?</h3>
          </div>
          
          {/* Gruppe A: Standardmodule */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <Checkbox 
                checked={includeStats && includeChart} 
                onCheckedChange={(checked) => {
                  setIncludeStats(!!checked);
                  setIncludeChart(!!checked);
                }} 
                className="mt-0.5"
              />
              <div>
                <span className="font-medium">Zusammenfassung (Statistiken & Diagramme)</span>
                <p className="text-xs text-muted-foreground mt-0.5">Empfohlen. Zeigt Frequenz und Wirksamkeit deiner Medikamente sowie den Verlauf der Schmerzstärke.</p>
              </div>
            </label>
            
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <Checkbox 
                checked={includeAnalysis} 
                onCheckedChange={(checked) => {
                  setIncludeAnalysis(!!checked);
                  if (!checked) setAnalysisReport("");
                }} 
                className="mt-0.5"
              />
              <div>
                <span className="font-medium">Professioneller Analysebericht (KI-generiert)</span>
                <p className="text-xs text-muted-foreground mt-0.5">Erkennt mögliche Muster und Auffälligkeiten. Keine Diagnose.</p>
              </div>
            </label>
            
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <Checkbox 
                checked={includeEntriesList} 
                onCheckedChange={(checked) => setIncludeEntriesList(!!checked)} 
                className="mt-0.5"
              />
              <div>
                <span className="font-medium">Detaillierte Einträge-Liste</span>
                <p className="text-xs text-muted-foreground mt-0.5">Alle einzelnen Kopfschmerz-Einträge in Tabellenform. Ideal für Arzttermine.</p>
              </div>
            </label>
          </div>

          {/* Gruppe B: Zusatzoptionen */}
          <div className="pt-3 border-t space-y-3">
            <p className="text-xs text-muted-foreground">Zusätzliche Informationen, die du je nach Empfänger ein- oder ausblenden kannst.</p>
            
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <Checkbox 
                checked={includeMedicationCourses} 
                onCheckedChange={(checked) => setIncludeMedicationCourses(!!checked)} 
                disabled={medicationCourses.length === 0}
                className="mt-0.5"
              />
              <div>
                <span className="font-medium">Therapieübersicht (Prophylaxe & Akutbehandlungen)</span>
                {medicationCourses.length === 0 && (
                  <span className="text-xs text-muted-foreground ml-2">(keine vorhanden)</span>
                )}
              </div>
            </label>
            
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <Checkbox 
                checked={includePatientData} 
                onCheckedChange={(checked) => setIncludePatientData(!!checked)} 
                className="mt-0.5"
              />
              <div>
                <span className="font-medium">Persönliche Daten einbeziehen</span>
                <p className="text-xs text-muted-foreground mt-0.5">Deaktiviere diese Option, wenn du das Tagebuch anonym teilen möchtest.</p>
              </div>
            </label>
          </div>
        </Card>

        {/* Block 4: Arztdaten */}
        <Card className="p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">Arztdaten</h3>
            <p className="text-xs text-muted-foreground">Du kannst Ärztedaten im Tagebuch anzeigen, z.B. für Arztpraxis oder Klinik.</p>
          </div>
          
          {/* Case A: No doctors */}
          {doctors.length === 0 && (
            <div className="border border-border/50 rounded-lg p-4 bg-muted/30">
              <div className="flex items-start gap-3">
                <UserPlus className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-3">
                    Es sind noch keine Ärztedaten hinterlegt.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (onNavigate) {
                        onNavigate('settings-doctors?origin=export_migraine_diary');
                      }
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Arztdaten hinzufügen
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Case B: Exactly 1 doctor */}
          {doctors.length === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={includeDoctorData}
                    onCheckedChange={(checked) => {
                      setIncludeDoctorData(checked);
                      if (checked && doctors[0]?.id) {
                        setSelectedDoctorIds([doctors[0].id]);
                      }
                    }}
                  />
                  <div>
                    <span className="text-sm font-medium">Arztdaten im PDF anzeigen</span>
                    <p className="text-xs text-muted-foreground">
                      {[doctors[0]?.title, doctors[0]?.first_name, doctors[0]?.last_name].filter(Boolean).join(' ')}
                      {doctors[0]?.specialty && ` – ${doctors[0].specialty}`}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate('settings-doctors');
                    }
                  }}
                  className="shrink-0"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          
          {/* Case C: Multiple doctors */}
          {doctors.length > 1 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Wähle, welche deiner gespeicherten Ärzte im Tagebuch angezeigt werden sollen.
              </p>
              
              <div className="space-y-2">
                {doctors.map((doctor) => {
                  const isSelected = doctor.id ? selectedDoctorIds.includes(doctor.id) : false;
                  return (
                    <div
                      key={doctor.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                      }`}
                      onClick={() => {
                        if (!doctor.id) return;
                        setSelectedDoctorIds(prev => {
                          const newIds = isSelected 
                            ? prev.filter(id => id !== doctor.id)
                            : [...prev, doctor.id!];
                          // Auto-enable doctor data if at least one is selected
                          setIncludeDoctorData(newIds.length > 0);
                          return newIds;
                        });
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => {
                          if (!doctor.id) return;
                          setSelectedDoctorIds(prev => {
                            const newIds = isSelected 
                              ? prev.filter(id => id !== doctor.id)
                              : [...prev, doctor.id!];
                            setIncludeDoctorData(newIds.length > 0);
                            return newIds;
                          });
                        }}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">
                          {[doctor.title, doctor.first_name, doctor.last_name].filter(Boolean).join(' ') || 'Unbekannt'}
                        </span>
                        {doctor.specialty && (
                          <p className="text-xs text-muted-foreground">{doctor.specialty}</p>
                        )}
                      </div>
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  );
                })}
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  {selectedDoctorIds.length === 0
                    ? 'Kein Arzt ausgewählt – keine Arztdaten im PDF'
                    : `${selectedDoctorIds.length} von ${doctors.length} Ärzten ausgewählt`}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate('settings-doctors');
                    }
                  }}
                  className="text-xs"
                >
                  Ärzte verwalten
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Block 4: Freitext & Notizen */}
        <Card className="p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">Freitext & Notizen im PDF</h3>
            <p className="text-xs text-muted-foreground">Bestimme, ob persönliche Notizen und ausführliche Kontext-Texte mit in das Tagebuch aufgenommen werden sollen.</p>
          </div>
          
          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm cursor-pointer p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
              <input 
                type="radio" 
                name="freeTextMode" 
                value="none"
                checked={freeTextExportMode === 'none'} 
                onChange={() => setFreeTextExportMode('none')}
                className="mt-1 accent-primary"
              />
              <div>
                <span className="font-medium">Keine persönlichen Notizen/Kontexte (empfohlen)</span>
                <p className="text-xs text-muted-foreground mt-0.5">Gut geeignet für Arztpraxis, Klinik oder Krankenkasse. Strukturierte Daten und KI-Auswertung, aber ohne deine Freitext-Einträge.</p>
              </div>
            </label>
            
            <label className="flex items-start gap-3 text-sm cursor-pointer p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
              <input 
                type="radio" 
                name="freeTextMode" 
                value="short_notes"
                checked={freeTextExportMode === 'short_notes'} 
                onChange={() => setFreeTextExportMode('short_notes')}
                className="mt-1 accent-primary"
              />
              <div>
                <span className="font-medium">Kurze Notizen einbeziehen</span>
                <p className="text-xs text-muted-foreground mt-0.5">Das Feld „Kurze Notizen" wird in der Einträge-Liste angezeigt (z.B. Stress, Stimmung, Schlafqualität). Der ausführliche Kontext bleibt nur intern.</p>
              </div>
            </label>
            
            <label className="flex items-start gap-3 text-sm cursor-pointer p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
              <input 
                type="radio" 
                name="freeTextMode" 
                value="notes_and_context"
                checked={freeTextExportMode === 'notes_and_context'} 
                onChange={() => setFreeTextExportMode('notes_and_context')}
                className="mt-1 accent-primary"
              />
              <div>
                <span className="font-medium">Notizen + ausführlicher Kontext-Anhang</span>
                <p className="text-xs text-muted-foreground mt-0.5">Kurze Notizen erscheinen in der Einträge-Liste. Zusätzlich wird am Ende des PDFs ein Anhang mit den ausführlichen Kontext-Texten pro Eintrag erstellt.</p>
              </div>
            </label>
          </div>
        </Card>

        {/* Block 5: Anmerkungen für den Arzt */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold mb-1">Anmerkungen für den Arzt (optional)</h3>
              <p className="text-xs text-muted-foreground">Hier kannst du besondere Hinweise, Fragen oder aktuelle Anliegen für deinen Arzt notieren. Dieser Text erscheint im Abschnitt „Anmerkungen des Patienten" im PDF.</p>
            </div>
            {patientNotes.trim() && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <Checkbox 
                  checked={includePatientNotes} 
                  onCheckedChange={(checked) => setIncludePatientNotes(!!checked)} 
                  className="h-3 w-3"
                />
                Im Bericht
              </label>
            )}
          </div>
          <textarea
            value={patientNotes}
            onChange={e => {
              const newValue = e.target.value.slice(0, 1000);
              setPatientNotes(newValue);
              if (newValue.trim() && !includePatientNotes) {
                setIncludePatientNotes(true);
              }
            }}
            placeholder="Hier kannst du wichtige Hinweise, besondere Ereignisse oder Fragen an deinen Arzt notieren (optional)."
            className="w-full min-h-[100px] max-h-[200px] p-3 text-sm border border-border/50 rounded-md bg-background resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            rows={4}
          />
          <div className="flex justify-end">
            <span className={`text-xs ${patientNotes.length > 900 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {patientNotes.length} / 1000
            </span>
          </div>
        </Card>

      {/* Export Actions */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Export</h3>
            <div className="text-sm text-muted-foreground">
              {filteredEntries.length > 0 ? (
                <span>
                  <span className="font-semibold text-foreground">{filteredEntries.length}</span> Einträge 
                  {" "}({format(new Date(from), 'dd.MM.yyyy')} - {format(new Date(to), 'dd.MM.yyyy')})
                </span>
              ) : (
                <span className="text-destructive">Keine Einträge</span>
              )}
            </div>
          </div>

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
                PDF erstellen
              </>
            )}
          </Button>

          <Button 
            onClick={exportCSV}
            disabled={!filteredEntries.length || isGeneratingReport}
            variant="outline"
            className="w-full"
          >
            <Table className="mr-2 h-4 w-4" />
            CSV-Export (für Excel)
          </Button>

          <Button 
            onClick={generateMedicationPlanPdf}
            disabled={medicationCourses.length === 0 || isGeneratingMedPlan || isGeneratingReport}
            variant="outline"
            className="w-full"
          >
            {isGeneratingMedPlan ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Medikationsplan wird erstellt...
              </>
            ) : (
              <>
                <Pill className="mr-2 h-4 w-4" />
                Medikationsplan (BMP-Stil)
              </>
            )}
          </Button>

          {filteredEntries.length > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
              <p className="font-medium mb-1">Das PDF enthält:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                {includeStats && <li>Medikamenten-Statistiken</li>}
                {includeChart && <li>Schmerzintensität-Verlauf (Diagramm)</li>}
                {includeAnalysis && <li>KI-gestützte Mustererkennung (dauert ca. 10-15 Sek.)</li>}
                {includeEntriesList && <li>Detaillierte Einträge-Tabelle</li>}
                {includePatientData && <li>Persönliche Daten</li>}
                {includeDoctorData && selectedDoctorsForExport.length > 0 && <li>Arztkontakte ({selectedDoctorsForExport.length})</li>}
                {includeMedicationCourses && medicationCourses.length > 0 && <li>Therapieverlauf (Prophylaxe & Akut)</li>}
                {includePatientNotes && patientNotes.trim() && <li>Anmerkungen des Patienten</li>}
              </ul>
            </div>
          )}

          {medicationCourses.length > 0 && (
            <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 p-3 rounded-md">
              <p className="font-medium mb-1 text-primary">Medikationsplan (BMP-Stil):</p>
              <p>Separates PDF im Stil des bundeseinheitlichen Medikationsplans mit aktueller Medikation und Therapiehistorie – ohne KI-Interpretation.</p>
            </div>
          )}
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
          // Update selected IDs state
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
  );
}