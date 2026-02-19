/**
 * DoctorShareDialog – Zero-Decision-UX
 * Step 1: Doctor selection (if >1 active doctor)
 * Step 2: Single toggle for personal notes
 * Step 3: Calm progress animation during share creation
 * AI analysis starts automatically, no separate prompt.
 *
 * IMPORTANT: Archived doctors (is_active=false) are NEVER used.
 * If exactly 1 active doctor → auto-selected (smart default).
 * If >1 active doctor → DoctorSelectionDialog shown first.
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

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
import { DoctorSelectionDialog, type Doctor } from "../DoctorSelectionDialog";
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

const PROGRESS_STEPS = [
  "Freigabe wird vorbereitet …",
  "Kopfschmerztagebuch wird erstellt …",
  "Daten werden aufbereitet …",
];

type Phase = "doctor-select" | "toggle" | "progress";

export const DoctorShareDialog: React.FC<DoctorShareDialogProps> = ({
  onComplete,
  onCancel,
}) => {
  const today = useMemo(() => new Date(), []);
  const from = useMemo(() => fmt(addMonths(today, -3)), [today]);
  const to = useMemo(() => fmt(today), [today]);

  const [phase, setPhase] = useState<Phase>("toggle");
  const [shareNotes, setShareNotes] = useState(false);
  const [selectedDoctors, setSelectedDoctors] = useState<Doctor[]>([]);
  const [showDoctorDialog, setShowDoctorDialog] = useState(false);

  // Progress state
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [generationDone, setGenerationDone] = useState(false);

  const { data: allDoctors = [] } = useDoctors();
  const { data: medicationCourses = [] } = useMedicationCourses();
  const { data: shareStatus, refetch: refetchShareStatus } = useDoctorShareStatus();
  const activateMutation = useActivateDoctorShare();

  // IMPORTANT: Only use active (non-archived) doctors
  const activeDoctors = useMemo(
    () => allDoctors.filter((d) => d.is_active !== false),
    [allDoctors]
  );

  // Smart default: if exactly 1 active doctor, auto-select
  // If >1, we need to show selection dialog first
  useEffect(() => {
    if (activeDoctors.length === 1) {
      setSelectedDoctors(activeDoctors);
      setPhase("toggle");
    } else if (activeDoctors.length > 1) {
      setPhase("doctor-select");
      setShowDoctorDialog(true);
    } else {
      // No active doctors - proceed without doctor data
      setSelectedDoctors([]);
      setPhase("toggle");
    }
  }, [activeDoctors]);

  // Smooth progress animation (visual only, ~4.5s total)
  useEffect(() => {
    if (phase !== "progress") return;

    // Step text changes at 33% and 66%
    const stepTimer1 = setTimeout(() => setStepIndex(1), 1500);
    const stepTimer2 = setTimeout(() => setStepIndex(2), 3000);

    // Smooth progress: 0→90% over 4s, then wait for done
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return 90; // cap at 90 until done
        return prev + 2;
      });
    }, 80);

    return () => {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearInterval(interval);
    };
  }, [phase]);

  // When generation completes, animate to 100% and finish
  useEffect(() => {
    if (!generationDone || phase !== "progress") return;
    setProgress(100);
    setStepIndex(2);
  }, [generationDone, phase]);

  // After progress reaches 100, wait a beat then complete
  const [resultCode, setResultCode] = useState<string | null>(null);
  useEffect(() => {
    if (progress === 100 && resultCode) {
      const timer = setTimeout(() => onComplete(resultCode), 600);
      return () => clearTimeout(timer);
    }
  }, [progress, resultCode, onComplete]);

  // Handle doctor selection confirm
  const handleDoctorSelectionConfirm = useCallback((doctors: Doctor[]) => {
    setSelectedDoctors(doctors);
    setShowDoctorDialog(false);
    setPhase("toggle");
  }, []);

  // Handle doctor selection cancel
  const handleDoctorSelectionClose = useCallback(() => {
    setShowDoctorDialog(false);
    onCancel();
  }, [onCancel]);

  const handleContinue = useCallback(async () => {
    setPhase("progress");

    try {
      // 1. Activate share
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
      await upsertShareSettings(shareId, {
        range_preset: "3m",
        custom_from: null,
        custom_to: null,
        include_entry_notes: shareNotes,
        include_context_notes: false, // Private notes never shared by default
        include_ai_analysis: true, // auto-enabled
      });

      // 3. Load data
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      const { data: freshPatientData } = await supabase
        .from("patient_data")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const entries = await fetchAllEntriesForExport(from, to);

      if (entries.length === 0) {
        setResultCode(shareCode);
        setGenerationDone(true);
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

      // 4. Generate PDF — use ONLY selected (active) doctors
      const medicationStats = reportData.acuteMedicationStats.map((stat) => ({
        name: stat.name,
        count: stat.last30Units,
        avgEffect: stat.avgEffectiveness ?? 0,
        ratedCount: stat.ratedCount,
        totalUnitsInRange: stat.totalUnitsInRange,
        avgPerMonth: stat.avgPerMonth,
        last30Units: stat.last30Units,
      }));

      const includeNotes = shareNotes;

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
        includeDoctorData: selectedDoctors.length > 0,
        includeMedicationCourses: true,
        includePatientNotes: includeNotes,
        freeTextExportMode: includeNotes ? "short_notes" : "none",
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
          selectedDoctors.length > 0
            ? selectedDoctors.map((d) => ({
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
          include_notes: shareNotes,
          include_ai_analysis: true,
          ai_used: false,
          generated_for: "doctor_share",
        },
      });

      await upsertShareSettings(shareId, {
        generated_report_id: savedReport.id,
      });

      setResultCode(shareCode);
      setGenerationDone(true);
    } catch (error) {
      console.error("Share-Erstellung fehlgeschlagen:", error);
      // On error, go back to toggle phase
      setPhase("toggle");
      setProgress(0);
      setStepIndex(0);
    }
  }, [shareStatus, shareNotes, from, to, selectedDoctors, medicationCourses, activateMutation, refetchShareStatus, onComplete]);

  // ─── Phase: Doctor Selection (>1 active doctor) ────────
  if (phase === "doctor-select") {
    return (
      <>
        <div className="flex flex-col min-h-full">
          <div className="flex-1 flex flex-col justify-center items-center px-4">
            <p className="text-sm text-muted-foreground">
              Bitte wählen Sie den behandelnden Arzt aus…
            </p>
          </div>
        </div>
        <DoctorSelectionDialog
          open={showDoctorDialog}
          onClose={handleDoctorSelectionClose}
          doctors={activeDoctors}
          onConfirm={handleDoctorSelectionConfirm}
          title="Arzt für Bericht auswählen"
        />
      </>
    );
  }

  // ─── Phase: Toggle ─────────────────────────────────────
  if (phase === "toggle") {
    return (
      <div className="flex flex-col min-h-full">
        <div className="flex-1 flex flex-col justify-center items-center px-4 pb-28">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Persönliche Notizen teilen?
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Freie Anmerkungen, die du selbst ergänzt hast.
          </p>

          {/* Toggle row */}
          <div className="flex items-center gap-4">
            <span className={`text-sm transition-colors ${!shareNotes ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              Nicht teilen
            </span>
            <Switch
              checked={shareNotes}
              onCheckedChange={setShareNotes}
            />
            <span className={`text-sm transition-colors ${shareNotes ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              Teilen
            </span>
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 left-0 right-0 bg-background border-t border-border p-4 -mx-4 -mb-4 mt-auto">
          <Button
            onClick={handleContinue}
            size="lg"
            className="w-full"
          >
            Weiter
          </Button>
        </div>
      </div>
    );
  }

  // ─── Phase: Progress ───────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 flex flex-col justify-center items-center px-6">
        <p className="text-sm text-foreground mb-4 text-center transition-opacity duration-500">
          {PROGRESS_STEPS[stepIndex]}
        </p>

        <div className="w-full max-w-xs">
          <Progress
            value={progress}
            className="h-2 bg-muted/30"
          />
        </div>

        <p className="text-xs text-muted-foreground/60 mt-6">
          Das kann einen Moment dauern.
        </p>
      </div>
    </div>
  );
};

export default DoctorShareDialog;
