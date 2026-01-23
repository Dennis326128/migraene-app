/**
 * DoctorShareDialog
 * Vollständiger "Mit Arzt teilen" Flow mit Settings und PDF-Generierung
 * 
 * UI-Stil: Übernommen von DiaryReport.tsx - Full-width Screen-Layout
 * - Zeitraum-Auswahl
 * - Datenschutz-Schalter (Default AUS)
 * - KI-Analyse (Premium, orange Badge)
 * - Fixe Inhalte (nicht abwählbar)
 */

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, Info, FileText, Lock, Brain, Check, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

import { supabase } from "@/lib/supabaseClient";
import { TimeRangeButtons, type TimeRangePreset } from "../TimeRangeButtons";
import { buildDiaryPdf } from "@/lib/pdf/report";
import { buildReportData } from "@/lib/pdf/reportData";
import { fetchAllEntriesForExport } from "@/features/entries/api/entries.api";
import { usePatientData, useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { useDiaryReportQuota } from "@/features/ai-reports/hooks/useDiaryReportQuota";
import { saveGeneratedReport } from "@/features/reports/api/generatedReports.api";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  useDoctorShareStatus, 
  useActivateDoctorShare 
} from "@/features/doctor-share";
import { upsertShareSettings } from "@/features/doctor-share/api/doctorShareSettings.api";

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

// Toggle-Row Komponente (identisch zu DiaryReport)
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
  
  // Advanced Section
  const [advancedOpen, setAdvancedOpen] = useState(false);
  
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
        range_preset: preset === 'all' ? '12m' : preset,
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
        report_type: 'diary',
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
    <div className="flex flex-col min-h-full">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto pb-28 space-y-4">
        
        {/* ═══════════════════════════════════════════════════════════════════
            ZEITRAUM CARD - Identisch zu DiaryReport
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Zeitraum</h3>
          <TimeRangeButtons value={preset} onChange={setPreset} compact />

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

          {/* Zeitraum Anzeige */}
          <div className="text-sm text-muted-foreground pt-1">
            {rangeLabel}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            OPTIONEN CARD - Toggle-Listen-Stil wie DiaryReport
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="divide-y divide-border/50">
          
          {/* Section: Immer enthaltene Inhalte (Info) */}
          <div className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground text-sm">Immer enthalten:</p>
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
          </div>

          {/* Section: Datenschutz-Optionen (Accordion) */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-sm hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">Datenschutz-Optionen</span>
              </div>
              {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4 space-y-0.5">
              <ToggleRow
                label="Notizen aus Schmerzeinträgen"
                checked={includeEntryNotes}
                onCheckedChange={setIncludeEntryNotes}
                subtext="Persönliche Notizen werden geteilt"
              />
              <ToggleRow
                label="Kontextnotizen teilen"
                checked={includeContextNotes}
                onCheckedChange={setIncludeContextNotes}
                subtext="Zusätzliche Notizen aus Spracheinträgen"
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Premium Section: KI-Analysebericht - Identisch zu DiaryReport */}
          <div className="p-4 border-t border-border/30 bg-gradient-to-r from-amber-500/5 to-amber-600/5">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Brain className="h-4 w-4 text-amber-500/80" />
                <span className="text-sm font-medium">KI-Analysebericht</span>
                <PremiumBadge />
              </div>
              <Switch 
                checked={includeAI && !isQuotaExhausted && !isAIDisabled} 
                onCheckedChange={(checked) => {
                  if (!isQuotaExhausted && !isAIDisabled) {
                    setIncludeAI(checked);
                  }
                }}
                disabled={isGenerating || isQuotaExhausted || isAIDisabled}
                className="ml-3 shrink-0"
              />
            </div>
            
            {/* Status Display - Minimal */}
            {(isAIDisabled || isQuotaExhausted) && (
              <div className="mt-2 pl-6">
                {isAIDisabled ? (
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
                ) : null}
              </div>
            )}
            
            {/* Quota Info - nur wenn nicht erschöpft/deaktiviert */}
            {!isAIDisabled && !isQuotaExhausted && (
              <div className="mt-1 pl-6">
                <p className="text-xs text-muted-foreground">
                  {quotaData?.isUnlimited 
                    ? "Unbegrenzt verfügbar"
                    : `${quotaData?.remaining ?? 0} von ${quotaData?.limit ?? 5} übrig`
                  }
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          STICKY ACTION BAR - Identisch zu DiaryReport
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="sticky bottom-0 left-0 right-0 bg-background border-t border-border p-4 space-y-2 -mx-4 -mb-4 mt-auto">
        <Button 
          onClick={handleCreateShare}
          disabled={isGenerating}
          size="lg"
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {generationStep || "Wird erstellt…"}
            </>
          ) : (
            <>
              <FileText className="mr-2 h-5 w-5" />
              Freigabe erstellen
            </>
          )}
        </Button>

        {/* Secondary action - less prominent */}
        <div className="flex justify-center">
          <Button 
            onClick={onCancel}
            disabled={isGenerating}
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Abbrechen
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DoctorShareDialog;
