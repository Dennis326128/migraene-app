/**
 * DoctorShareDialog
 * Vollständiger "Mit Arzt teilen" Flow mit Settings und PDF-Generierung
 * 
 * UI-Stil: ähnlich zu DiaryReport.tsx mit Toggle-Komponenten
 * - Zeitraum-Auswahl
 * - Datenschutz-Schalter (Default AUS)
 * - KI-Analyse (Premium, orange Badge)
 * - Fixe Inhalte (nicht abwählbar)
 */

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Info, FileText, Lock, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { supabase } from "@/lib/supabaseClient";
import { TimeRangeButtons, type TimeRangePreset } from "../TimeRangeButtons";
import { buildDiaryPdf } from "@/lib/pdf/report";
import { buildReportData } from "@/lib/pdf/reportData";
import { fetchAllEntriesForExport } from "@/features/entries/api/entries.api";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { useDiaryReportQuota } from "@/features/ai-reports/hooks/useDiaryReportQuota";
import { saveGeneratedReport } from "@/features/reports/api/generatedReports.api";
import { 
  useDoctorShareStatus, 
  useActivateDoctorShare 
} from "@/features/doctor-share";
import { upsertShareSettings } from "@/features/doctor-share/api/doctorShareSettings.api";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";

interface DoctorShareDialogProps {
  onComplete: (shareCode: string) => void;
  onCancel: () => void;
}

// Zeitraum-Hilfsfunktionen
function addMonths(d: Date, m: number) {
  const dd = new Date(d);
  dd.setMonth(dd.getMonth() + m);
  return dd;
}
function fmt(d: Date) { return d.toISOString().slice(0, 10); }

export const DoctorShareDialog: React.FC<DoctorShareDialogProps> = ({ 
  onComplete, 
  onCancel 
}) => {
  const today = useMemo(() => new Date(), []);
  
  // Zeitraum
  const [preset, setPreset] = useState<TimeRangePreset>("3m");
  const [customStart, setCustomStart] = useState<string>(fmt(addMonths(today, -3)));
  const [customEnd, setCustomEnd] = useState<string>(fmt(today));
  
  // Datenschutz-Toggles (Default AUS)
  const [includeEntryNotes, setIncludeEntryNotes] = useState(false);
  const [includeContextNotes, setIncludeContextNotes] = useState(false);
  
  // KI-Analyse
  const [includeAI, setIncludeAI] = useState(false);
  
  // UI State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>("");
  
  // Data hooks
  const { data: patientData } = usePatientData();
  const { data: doctors = [] } = useDoctors();
  const { data: medicationCourses = [] } = useMedicationCourses();
  const { data: quotaData } = useDiaryReportQuota();
  const { data: shareStatus, refetch: refetchShareStatus } = useDoctorShareStatus();
  const activateMutation = useActivateDoctorShare();
  
  // KI-Limits
  const isQuotaExhausted = quotaData && !quotaData.isUnlimited && quotaData.remaining <= 0;
  const isAIDisabled = quotaData && !quotaData.aiEnabled;
  
  // Auto-disable AI if quota exhausted
  useEffect(() => {
    if (isQuotaExhausted && includeAI) {
      setIncludeAI(false);
    }
  }, [isQuotaExhausted, includeAI]);
  
  // Zeitraum berechnen
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
  
  // Zeitraum-Label
  const rangeLabel = useMemo(() => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    return `${format(fromDate, 'dd.MM.yyyy', { locale: de })} – ${format(toDate, 'dd.MM.yyyy', { locale: de })}`;
  }, [from, to]);

  /**
   * Hauptfunktion: Freigabe erstellen + PDF generieren
   */
  const handleCreateShare = async () => {
    setIsGenerating(true);
    
    try {
      // Step 1: Share aktivieren (falls noch nicht aktiv)
      setGenerationStep("Freigabe wird aktiviert...");
      
      let currentShareId = shareStatus?.id;
      
      if (!shareStatus?.is_share_active) {
        await activateMutation.mutateAsync(undefined);
        await refetchShareStatus();
        // Nach refetch haben wir die aktuelle ID
      }
      
      // Hole aktuelle Share-Daten
      const { data: freshShareStatus } = await supabase
        .from('doctor_shares')
        .select('id, code_display')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!freshShareStatus) {
        throw new Error("Share konnte nicht erstellt werden");
      }
      
      currentShareId = freshShareStatus.id;
      const shareCode = freshShareStatus.code_display;
      
      // Step 2: Settings speichern
      setGenerationStep("Einstellungen werden gespeichert...");
      
      await upsertShareSettings(currentShareId, {
        range_preset: preset === 'all' ? '12m' : preset, // 'all' nicht unterstützt, fallback
        custom_from: preset === 'custom' ? customStart : null,
        custom_to: preset === 'custom' ? customEnd : null,
        include_entry_notes: includeEntryNotes,
        include_context_notes: includeContextNotes,
        include_ai_analysis: includeAI,
      });
      
      // Step 3: Daten laden
      setGenerationStep("Daten werden geladen...");
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");
      
      // Frische Patientendaten
      const { data: freshPatientData } = await supabase
        .from('patient_data')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      // Alle Einträge im Zeitraum
      const entries = await fetchAllEntriesForExport(from, to);
      
      if (entries.length === 0) {
        toast.warning("Keine Einträge im Zeitraum. Freigabe wurde trotzdem erstellt.");
        onComplete(shareCode);
        return;
      }
      
      // Medikamenteneffekte laden
      const entryIds = entries.map(e => Number(e.id));
      const { data: effects } = await supabase
        .from('medication_effects')
        .select('*')
        .in('entry_id', entryIds);
      
      // Report-Daten berechnen
      const reportData = buildReportData({
        entries,
        medicationEffects: (effects || []).map(e => ({
          entry_id: e.entry_id,
          med_name: e.med_name,
          effect_rating: e.effect_rating,
          effect_score: e.effect_score,
        })),
        fromDate: from,
        toDate: to,
        now: new Date(),
      });
      
      // Step 4: KI-Analyse (optional)
      let aiAnalysis: string | undefined;
      let premiumAIReport: any = undefined;
      
      if (includeAI && !isQuotaExhausted && !isAIDisabled) {
        setGenerationStep("KI-Analyse wird erstellt...");
        
        try {
          // Statische Analyse
          const { data: analysisData } = await supabase.functions.invoke('generate-doctor-summary', {
            body: { 
              fromDate: `${from}T00:00:00Z`, 
              toDate: `${to}T23:59:59Z`,
              includeContextNotes,
              totalAttacks: reportData.kpis.totalAttacks,
              daysInRange: reportData.kpis.daysInRange
            }
          });
          
          if (analysisData?.summary) {
            aiAnalysis = analysisData.summary;
          }
          
          // Premium KI-Bericht
          const { data: premiumData } = await supabase.functions.invoke('generate-ai-diary-report', {
            body: {
              fromDate: from,
              toDate: to,
              includeStats: true,
              includeTherapies: true,
              includeEntryNotes,
              includeContextNotes,
            }
          });
          
          if (premiumData && !premiumData.errorCode) {
            premiumAIReport = premiumData;
          }
        } catch (aiError) {
          console.warn("KI-Analyse fehlgeschlagen:", aiError);
          // Weiter ohne KI
        }
      }
      
      // Step 5: PDF generieren
      setGenerationStep("PDF wird erstellt...");
      
      const freeTextMode = includeContextNotes ? 'notes_and_context' : (includeEntryNotes ? 'short_notes' : 'none');
      
      const medicationStats = reportData.acuteMedicationStats.map(stat => ({
        name: stat.name,
        count: stat.last30Units,
        avgEffect: stat.avgEffectiveness ?? 0,
        ratedCount: stat.ratedCount,
        totalUnitsInRange: stat.totalUnitsInRange,
        avgPerMonth: stat.avgPerMonth,
        last30Units: stat.last30Units,
      }));
      
      const pdfBytes = await buildDiaryPdf({
        title: "Kopfschmerztagebuch (Arztfreigabe)",
        from,
        to,
        entries,
        selectedMeds: [],
        
        includeStats: true,
        includeChart: true,
        includeAnalysis: !includeAI && !!aiAnalysis,
        includeEntriesList: true,
        includePatientData: true,
        includeDoctorData: doctors.length > 0,
        includeMedicationCourses: true,
        includePatientNotes: false,
        freeTextExportMode: freeTextMode as any,
        
        isPremiumAIRequested: includeAI,
        
        analysisReport: aiAnalysis,
        patientNotes: "",
        medicationStats,
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
          email: user.email || "",
          dateOfBirth: freshPatientData.date_of_birth || "",
          healthInsurance: freshPatientData.health_insurance || "",
          insuranceNumber: freshPatientData.insurance_number || ""
        } : undefined,
        doctors: doctors.length > 0 ? doctors.map(d => ({
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
        premiumAIReport,
      });
      
      // Step 6: PDF in generated_reports speichern
      setGenerationStep("Bericht wird gespeichert...");
      
      const savedReport = await saveGeneratedReport({
        report_type: 'diary', // Standard-Typ für Kompatibilität mit "Gespeicherte Berichte"
        title: `Kopfschmerztagebuch (Arztfreigabe) – ${rangeLabel}`,
        from_date: from,
        to_date: to,
        pdf_bytes: pdfBytes,
        metadata: {
          share_id: currentShareId,
          range_preset: preset,
          include_entry_notes: includeEntryNotes,
          include_context_notes: includeContextNotes,
          include_ai_analysis: includeAI,
          ai_used: !!premiumAIReport,
          generated_for: 'doctor_share',
        },
      });
      
      // Link Report zu Share-Settings
      await upsertShareSettings(currentShareId, {
        generated_report_id: savedReport.id,
        ai_analysis_generated_at: includeAI ? new Date().toISOString() : null,
      });
      
      toast.success("Freigabe erstellt und Bericht gespeichert!");
      onComplete(shareCode);
      
    } catch (error) {
      console.error("Share-Erstellung fehlgeschlagen:", error);
      toast.error("Freigabe konnte nicht erstellt werden");
    } finally {
      setIsGenerating(false);
      setGenerationStep("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Zeitraum */}
      <Card className="p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Zeitraum</h3>
        <TimeRangeButtons
          value={preset}
          onChange={setPreset}
          compact
        />
        
        {/* Custom Date Pickers */}
        {preset === "custom" && (
          <div className="flex gap-2 mt-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Von</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal h-9 text-sm">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(new Date(customStart), 'dd.MM.yyyy', { locale: de })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(customStart)}
                    onSelect={(date) => date && setCustomStart(fmt(date))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Bis</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal h-9 text-sm">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(new Date(customEnd), 'dd.MM.yyyy', { locale: de })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(customEnd)}
                    onSelect={(date) => date && setCustomEnd(fmt(date))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
        
        <p className="text-xs text-muted-foreground mt-2">{rangeLabel}</p>
      </Card>
      
      {/* Datenschutz-Optionen */}
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Datenschutz-Optionen
        </h3>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Notizen aus Schmerzeinträgen</p>
            <p className="text-xs text-muted-foreground">Persönliche Notizen werden geteilt</p>
          </div>
          <Switch 
            checked={includeEntryNotes} 
            onCheckedChange={setIncludeEntryNotes}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Kontextnotizen teilen</p>
            <p className="text-xs text-muted-foreground">Zusätzliche Notizen aus Spracheinträgen</p>
          </div>
          <Switch 
            checked={includeContextNotes} 
            onCheckedChange={setIncludeContextNotes}
          />
        </div>
      </Card>
      
      {/* KI-Analyse (Premium) */}
      <Card className="p-4 border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Sparkles className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  KI-Analysebericht
                </p>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-200 text-orange-700 dark:bg-orange-800 dark:text-orange-200">
                  Premium
                </span>
              </div>
              <p className="text-xs text-orange-700/80 dark:text-orange-300/80">
                {isQuotaExhausted 
                  ? "Monatliches Limit erreicht" 
                  : isAIDisabled
                    ? "KI ist deaktiviert"
                    : quotaData?.isUnlimited 
                      ? "Unbegrenzt verfügbar"
                      : `${quotaData?.remaining ?? 0} von ${quotaData?.limit ?? 5} übrig`
                }
              </p>
            </div>
          </div>
          <Switch 
            checked={includeAI} 
            onCheckedChange={setIncludeAI}
            disabled={isQuotaExhausted || isAIDisabled}
          />
        </div>
      </Card>
      
      {/* Fixe Inhalte (Info) */}
      <Card className="p-4 bg-muted/30">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Immer enthalten:</p>
            <ul className="space-y-0.5">
              <li className="flex items-center gap-1.5">
                <Check className="w-3 h-3" /> Statistiken & Diagramme
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3 h-3" /> Einträge-Liste
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3 h-3" /> Therapien & Prophylaxe
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="w-3 h-3" /> Patientendaten (falls vorhanden)
              </li>
            </ul>
          </div>
        </div>
      </Card>
      
      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button 
          variant="outline" 
          onClick={onCancel}
          disabled={isGenerating}
          className="flex-1"
        >
          Abbrechen
        </Button>
        <Button 
          onClick={handleCreateShare}
          disabled={isGenerating}
          className="flex-1"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {generationStep || "Wird erstellt..."}
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              Freigabe erstellen
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default DoctorShareDialog;
