/**
 * DoctorShareDialog – Minimal
 * Ein Satz, ein Button. Zero-Decision-UX für den Arztkontext.
 */

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { buildDiaryPdf } from "@/lib/pdf/report";
import { buildReportData } from "@/lib/pdf/reportData";
import { fetchAllEntriesForExport } from "@/features/entries/api/entries.api";
import { useDoctors } from "@/features/account/hooks/useAccount";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { saveGeneratedReport } from "@/features/reports/api/generatedReports.api";
import {
  useDoctorShareStatus,
  useActivateDoctorShare,
} from "@/features/doctor-share";
import { upsertShareSettings } from "@/features/doctor-share/api/doctorShareSettings.api";
import { format } from "date-fns";
import { de } from "date-fns/locale";

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
  const from = useMemo(() => fmt(addMonths(today, -3)), [today]);
  const to = useMemo(() => fmt(today), [today]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  const { data: doctors = [] } = useDoctors();
  const { data: medicationCourses = [] } = useMedicationCourses();
  const { data: shareStatus, refetch: refetchShareStatus } = useDoctorShareStatus();
  const activateMutation = useActivateDoctorShare();

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

      // 2. Save settings (defaults, no notes, no AI in share step)
      setGenerationStep("Einstellungen werden gespeichert…");
      await upsertShareSettings(shareId, {
        range_preset: "3m",
        custom_from: null,
        custom_to: null,
        include_entry_notes: false,
        include_context_notes: false,
        include_ai_analysis: false,
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

      // 4. Generate PDF (no AI, no notes)
      setGenerationStep("Bericht wird erstellt…");

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
        includeAnalysis: false,
        includeEntriesList: true,
        includePatientData: true,
        includeDoctorData: doctors.length > 0,
        includeMedicationCourses: true,
        includePatientNotes: false,
        freeTextExportMode: "none",
        isPremiumAIRequested: false,
        analysisReport: undefined,
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
        premiumAIReport: undefined,
      });

      // 5. Save report
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
          include_notes: false,
          include_ai_analysis: false,
          ai_used: false,
          generated_for: "doctor_share",
        },
      });

      await upsertShareSettings(shareId, {
        generated_report_id: savedReport.id,
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
      <div className="flex-1 flex flex-col justify-center items-center pb-28">
        <p className="text-sm text-muted-foreground text-center">
          Dein Kopfschmerz-Verlauf wird für deine Ärztin freigegeben.
        </p>
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
