/**
 * DoctorShareDialog – Simplified
 * Ein Screen, zwei Schalter, eine Aktion.
 * Zero-Decision-UX für den Arztkontext.
 */

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { supabase } from "@/lib/supabaseClient";
import { buildDiaryPdf } from "@/lib/pdf/report";
import { buildReportData } from "@/lib/pdf/reportData";
import { fetchAllEntriesForExport } from "@/features/entries/api/entries.api";
import { useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { useDiaryReportQuota } from "@/features/ai-reports/hooks/useDiaryReportQuota";
import { saveGeneratedReport } from "@/features/reports/api/generatedReports.api";
import {
  useDoctorShareStatus,
  useActivateDoctorShare,
} from "@/features/doctor-share";
import { upsertShareSettings } from "@/features/doctor-share/api/doctorShareSettings.api";

interface DoctorShareDialogProps {
  onComplete: (shareCode: string) => void;
  onCancel: () => void;
}

function addMonths(d: Date, m: number) {
  const dd = new Date(d);
  dd.setMonth(dd.getMonth() + m);
  return dd;
}
function fmt(d: Date) { return d.toISOString().slice(0, 10); }

export const DoctorShareDialog: React.FC<DoctorShareDialogProps> = ({
  onComplete,
  onCancel,
}) => {
  const today = useMemo(() => new Date(), []);

  // Fixed range: 3 months (default, implicit)
  const from = useMemo(() => fmt(addMonths(today, -3)), [today]);
  const to = useMemo(() => fmt(today), [today]);

  // Two toggles only
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeAI, setIncludeAI] = useState(true); // Default ON in dev phase

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Data hooks
  const { data: doctors = [] } = useDoctors();
  const { data: medicationCourses = [] } = useMedicationCourses();
  const { data: quotaData } = useDiaryReportQuota();
  const { data: shareStatus, refetch: refetchShareStatus } = useDoctorShareStatus();
  const activateMutation = useActivateDoctorShare();

  // Quota logic
  const isQuotaExhausted = quotaData && !quotaData.isUnlimited && quotaData.remaining <= 0;
  const isAIDisabled = quotaData && !quotaData.aiEnabled;
  const canUseAI = !isQuotaExhausted && !isAIDisabled;

  useEffect(() => {
    if (!canUseAI && includeAI) setIncludeAI(false);
  }, [canUseAI, includeAI]);

  const handleCreateShare = async () => {
    setIsGenerating(true);
    setInlineError(null);

    try {
      // 1. Activate share
      setGenerationStep("Freigabe wird aktiviert…");

      if (!shareStatus?.is_share_active) {
        await activateMutation.mutateAsync(undefined);
        await refetchShareStatus();
      }

      const { data: freshShare } = await supabase
        .from("doctor_shares")
        .select("id, code_display")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!freshShare) throw new Error("Share konnte nicht erstellt werden");

      const shareId = freshShare.id;
      const shareCode = freshShare.code_display;

      // 2. Save settings
      setGenerationStep("Einstellungen werden gespeichert…");
      await upsertShareSettings(shareId, {
        range_preset: "3m",
        custom_from: null,
        custom_to: null,
        include_entry_notes: includeNotes,
        include_context_notes: includeNotes,
        include_ai_analysis: includeAI && canUseAI,
      });

      // 3. Load data
      setGenerationStep("Daten werden geladen…");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      const { data: freshPatientData } = await supabase
        .from("patient_data")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const entries = await fetchAllEntriesForExport(from, to);

      if (entries.length === 0) {
        onComplete(shareCode);
        return;
      }

      const entryIds = entries.map((e) => Number(e.id));
      const { data: effects } = await supabase
        .from("medication_effects")
        .select("*")
        .in("entry_id", entryIds);

      const reportData = buildReportData({
        entries,
        medicationEffects: (effects || []).map((e) => ({
          entry_id: e.entry_id,
          med_name: e.med_name,
          effect_rating: e.effect_rating,
          effect_score: e.effect_score,
        })),
        fromDate: from,
        toDate: to,
        now: new Date(),
      });

      // 4. AI analysis (optional)
      let aiAnalysis: string | undefined;
      let premiumAIReport: any = undefined;

      if (includeAI && canUseAI) {
        setGenerationStep("Analyse wird erstellt…");

        try {
          const { data: analysisData } = await supabase.functions.invoke(
            "generate-doctor-summary",
            {
              body: {
                fromDate: `${from}T00:00:00Z`,
                toDate: `${to}T23:59:59Z`,
                includeContextNotes: includeNotes,
                totalAttacks: reportData.kpis.totalAttacks,
                daysInRange: reportData.kpis.daysInRange,
              },
            }
          );

          if (analysisData?.summary) aiAnalysis = analysisData.summary;

          const { data: premiumData } = await supabase.functions.invoke(
            "generate-ai-diary-report",
            {
              body: {
                fromDate: from,
                toDate: to,
                includeStats: true,
                includeTherapies: true,
                includeEntryNotes: includeNotes,
                includeContextNotes: includeNotes,
              },
            }
          );

          if (premiumData && !premiumData.errorCode) {
            premiumAIReport = premiumData;
          }
        } catch (aiError) {
          console.warn("KI-Analyse fehlgeschlagen:", aiError);
        }
      }

      // 5. Generate PDF
      setGenerationStep("Bericht wird erstellt…");

      const freeTextMode = includeNotes ? "notes_and_context" : "none";

      const medicationStats = reportData.acuteMedicationStats.map((stat) => ({
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
        isPremiumAIRequested: includeAI && canUseAI,
        analysisReport: aiAnalysis,
        patientNotes: "",
        medicationStats,
        medicationCourses: medicationCourses.map((c) => ({
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
        patientData: freshPatientData
          ? {
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
              insuranceNumber: freshPatientData.insurance_number || "",
            }
          : undefined,
        doctors:
          doctors.length > 0
            ? doctors.map((d) => ({
                firstName: d.first_name || "",
                lastName: d.last_name || "",
                specialty: d.specialty || "",
                street: d.street || "",
                postalCode: d.postal_code || "",
                city: d.city || "",
                phone: d.phone || "",
                fax: d.fax || "",
                email: d.email || "",
              }))
            : undefined,
        premiumAIReport,
      });

      // 6. Save report
      setGenerationStep("Bericht wird gespeichert…");

      const rangeLabel = `${format(new Date(from), "dd.MM.yyyy", { locale: de })} – ${format(new Date(to), "dd.MM.yyyy", { locale: de })}`;

      const savedReport = await saveGeneratedReport({
        report_type: "diary",
        title: `Kopfschmerztagebuch (Arztfreigabe) – ${rangeLabel}`,
        from_date: from,
        to_date: to,
        pdf_bytes: pdfBytes,
        metadata: {
          share_id: shareId,
          range_preset: "3m",
          include_notes: includeNotes,
          include_ai_analysis: includeAI && canUseAI,
          ai_used: !!premiumAIReport,
          generated_for: "doctor_share",
        },
      });

      await upsertShareSettings(shareId, {
        generated_report_id: savedReport.id,
        ai_analysis_generated_at: includeAI ? new Date().toISOString() : null,
      });

      onComplete(shareCode);
    } catch (error) {
      console.error("Share-Erstellung fehlgeschlagen:", error);
      setInlineError("Freigabe konnte nicht erstellt werden. Bitte versuche es erneut.");
    } finally {
      setIsGenerating(false);
      setGenerationStep("");
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 overflow-y-auto pb-28 space-y-6">
        {/* Header text */}
        <p className="text-sm text-muted-foreground">
          Dein Kopfschmerz-Verlauf wird für deine Ärztin freigegeben und ein Kopfschmerztagebuch erstellt.
        </p>

        {/* Toggle 1: Privacy – personal notes */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Persönliche Notizen teilen</span>
            <Switch
              checked={includeNotes}
              onCheckedChange={setIncludeNotes}
              disabled={isGenerating}
              className="shrink-0"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Freie Texte, Kommentare und Zusatznotizen.
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-border/50" />

        {/* Toggle 2: AI analysis */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Kopfschmerztagebuch auswerten</h3>

          <div className="flex items-center justify-between">
            <span className="text-sm">Erweiterte Analyse (empfohlen)</span>
            <Switch
              checked={includeAI && canUseAI}
              onCheckedChange={(checked) => {
                if (canUseAI) setIncludeAI(checked);
              }}
              disabled={isGenerating || !canUseAI}
              className="shrink-0"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Erkennt Muster, Zusammenhänge und erstellt eine verständliche Zusammenfassung.
          </p>

          <p className="text-xs text-muted-foreground/70 italic">
            Für den Arzt ist keine zusätzliche Analyse erforderlich.
          </p>

          {/* Quota hint – neutral, small */}
          {!canUseAI && isQuotaExhausted && (
            <p className="text-xs text-muted-foreground/60">
              Verfügbar ab{" "}
              {(() => {
                const now = new Date();
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                return nextMonth.toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                });
              })()}
            </p>
          )}

          {canUseAI && (
            <p className="text-xs text-muted-foreground/60">
              Begrenzt verfügbar – kann jederzeit deaktiviert werden.
            </p>
          )}
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 left-0 right-0 bg-background border-t border-border p-4 space-y-2 -mx-4 -mb-4 mt-auto">
        {inlineError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{inlineError}</span>
          </div>
        )}

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
            "Freigabe erstellen"
          )}
        </Button>

        {!isGenerating && (
          <div className="flex justify-center">
            <Button
              onClick={onCancel}
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Abbrechen
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorShareDialog;
