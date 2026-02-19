/**
 * DoctorShareScreen – "Per Code teilen"
 *
 * State machine: idle → generating → success | error
 * - No intermediate confirm step – generation starts immediately
 * - 20s timeout prevents infinite loading
 * - Left-aligned layout matching the rest of the app
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useDoctorShareStatus,
  useActivateDoctorShare,
  useRevokeDoctorShare,
} from "@/features/doctor-share";
import { AppHeader } from "@/components/ui/app-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabaseClient";
import { buildDiaryPdf } from "@/lib/pdf/report";
import { buildReportData } from "@/lib/pdf/reportData";
import { fetchAllEntriesForExport } from "@/features/entries/api/entries.api";
import { useMedicationCourses } from "@/features/medication-courses/hooks/useMedicationCourses";
import { saveGeneratedReport } from "@/features/reports/api/generatedReports.api";
import { upsertShareSettings } from "@/features/doctor-share/api/doctorShareSettings.api";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface DoctorShareScreenProps {
  onBack: () => void;
}

type FlowState = "idle" | "generating" | "success" | "error";

const GENERATION_TIMEOUT_MS = 20_000;

function addMonths(d: Date, m: number) {
  const dd = new Date(d);
  dd.setMonth(dd.getMonth() + m);
  return dd;
}
function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatActiveUntil(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `heute ${timeStr} Uhr`;
  if (date.toDateString() === tomorrow.toDateString()) return `morgen ${timeStr} Uhr`;
  const dayStr = date.toLocaleDateString("de-DE", { weekday: "short" });
  return `${dayStr} ${timeStr} Uhr`;
}

export const DoctorShareScreen: React.FC<DoctorShareScreenProps> = ({ onBack }) => {
  const { data: shareStatus, isLoading, error: fetchError, refetch } = useDoctorShareStatus();
  const activateMutation = useActivateDoctorShare();
  const revokeMutation = useRevokeDoctorShare();
  const { data: medicationCourses = [] } = useMedicationCourses();

  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [justCreatedCode, setJustCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(false);

  const today = useMemo(() => new Date(), []);
  const from = useMemo(() => fmt(addMonths(today, -3)), [today]);
  const to = useMemo(() => fmt(today), [today]);

  // Determine if we should auto-start generation (no active share, not revoked today)
  const shouldAutoGenerate =
    !isLoading &&
    !fetchError &&
    shareStatus &&
    !shareStatus.is_share_active &&
    !shareStatus.was_revoked_today &&
    !justCreatedCode &&
    flowState === "idle";

  // Auto-start generation when entering without active share
  useEffect(() => {
    if (shouldAutoGenerate) {
      startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoGenerate]);

  const startGeneration = useCallback(async () => {
    if (flowState === "generating") return;
    abortRef.current = false;
    setFlowState("generating");

    const timeoutId = setTimeout(() => {
      if (!abortRef.current) {
        setFlowState("error");
      }
    }, GENERATION_TIMEOUT_MS);

    try {
      // 1. Activate share if needed
      if (!shareStatus?.is_share_active) {
        await activateMutation.mutateAsync(undefined);
        await refetch();
      }
      if (abortRef.current) return;

      const { data: freshShare } = await supabase
        .from("doctor_shares")
        .select("id, code_display")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!freshShare) throw new Error("Share konnte nicht erstellt werden");
      if (abortRef.current) return;

      const shareId = freshShare.id;
      const shareCode = freshShare.code_display;

      // 2. Save settings
      await upsertShareSettings(shareId, {
        range_preset: "3m",
        custom_from: null,
        custom_to: null,
        include_entry_notes: true,
        include_context_notes: false,
        include_ai_analysis: true,
      });
      if (abortRef.current) return;

      // 3. Load data
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      const { data: freshPatientData } = await supabase
        .from("patient_data")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const entries = await fetchAllEntriesForExport(from, to);
      if (abortRef.current) return;

      if (entries.length === 0) {
        clearTimeout(timeoutId);
        setJustCreatedCode(shareCode);
        setFlowState("success");
        refetch();
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
      if (abortRef.current) return;

      // 4. Generate PDF
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
        title: "Kopfschmerztagebuch (Freigabe)",
        from,
        to,
        entries,
        selectedMeds: [],
        includeStats: true,
        includeChart: true,
        includeAnalysis: false,
        includeEntriesList: true,
        includePatientData: true,
        includeDoctorData: false,
        includeMedicationCourses: true,
        includePatientNotes: true,
        freeTextExportMode: "short_notes",
        includePrivateNotes: false,
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
        doctors: undefined,
        premiumAIReport: undefined,
      });
      if (abortRef.current) return;

      // 5. Save report
      const rangeLabel = `${format(new Date(from), "dd.MM.yyyy", { locale: de })} – ${format(new Date(to), "dd.MM.yyyy", { locale: de })}`;

      const savedReport = await saveGeneratedReport({
        report_type: "diary",
        title: `Kopfschmerztagebuch (Freigabe) – ${rangeLabel}`,
        from_date: from,
        to_date: to,
        pdf_bytes: pdfBytes,
        metadata: {
          share_id: shareId,
          range_preset: "3m",
          include_notes: true,
          include_ai_analysis: true,
          ai_used: false,
          generated_for: "doctor_share",
        },
      });

      await upsertShareSettings(shareId, {
        generated_report_id: savedReport.id,
      });

      clearTimeout(timeoutId);
      if (abortRef.current) return;

      setJustCreatedCode(shareCode);
      setFlowState("success");
      refetch();
    } catch (err) {
      clearTimeout(timeoutId);
      if (!abortRef.current) {
        console.error("Share-Erstellung fehlgeschlagen:", err);
        setFlowState("error");
      }
    }
  }, [flowState, shareStatus, from, to, medicationCourses, activateMutation, refetch]);

  // Back handler – abort generation if in progress
  const handleBack = useCallback(() => {
    if (flowState === "generating") {
      abortRef.current = true;
      setFlowState("idle");
    }
    onBack();
  }, [flowState, onBack]);

  // Copy code
  const handleCopyCode = async () => {
    const code = justCreatedCode || shareStatus?.code_display;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code kopiert");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  // Reactivate (after revoke same day)
  const handleActivate = () => {
    activateMutation.mutate(undefined, {
      onSuccess: () => refetch(),
      onError: () => toast.error("Freigabe konnte nicht aktiviert werden"),
    });
  };

  // Revoke share
  const handleRevoke = () => {
    revokeMutation.mutate(undefined, {
      onSuccess: () => refetch(),
      onError: () => toast.error("Freigabe konnte nicht beendet werden"),
    });
  };

  const isPending = activateMutation.isPending || revokeMutation.isPending;
  const isShareActive = shareStatus?.is_share_active ?? false;

  return (
    <div className="flex flex-col h-full bg-background">
      <AppHeader title="Per Code teilen" onBack={handleBack} sticky />

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-md mx-auto space-y-6">

          {/* Loading initial data */}
          {isLoading && (
            <div className="py-8">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Wird geladen…</p>
              </div>
            </div>
          )}

          {/* Fetch error */}
          {!isLoading && fetchError && (
            <div className="py-8 space-y-4">
              <p className="text-sm text-muted-foreground">
                Der Code kann gerade nicht angezeigt werden.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* GENERATING state */}
          {flowState === "generating" && (
            <div className="py-8">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground">Freigabe wird erstellt…</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Das kann einen Moment dauern.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ERROR state */}
          {flowState === "error" && (
            <div className="py-8 space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-foreground">
                    Freigabe konnte nicht erstellt werden.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bitte versuche es erneut.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFlowState("idle");
                    startGeneration();
                  }}
                >
                  Erneut versuchen
                </Button>
                <Button variant="ghost" size="sm" onClick={onBack}>
                  Zurück
                </Button>
              </div>
            </div>
          )}

          {/* SUCCESS / ACTIVE share */}
          {!isLoading && !fetchError && flowState !== "generating" && flowState !== "error" &&
            (isShareActive || justCreatedCode) && (
            <div className="space-y-6">
              {/* Success banner after creation */}
              {justCreatedCode && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-sm text-foreground font-medium">
                    ✓ Freigabe erstellt & Bericht gespeichert
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Das PDF findest du unter „Verlauf"
                  </p>
                </div>
              )}

              {/* Code – tappable to copy */}
              <button
                onClick={handleCopyCode}
                className="bg-primary/5 border border-primary/20 rounded-xl px-8 py-6 cursor-pointer hover:bg-primary/10 active:scale-[0.98] transition-all duration-150 flex items-center gap-4"
                aria-label="Code kopieren"
              >
                <div className="font-mono text-4xl font-bold tracking-widest text-foreground">
                  {justCreatedCode || shareStatus?.code_display}
                </div>
                {copied ? (
                  <Check className="w-5 h-5 text-primary shrink-0" />
                ) : (
                  <Copy className="w-5 h-5 text-muted-foreground/60 shrink-0" />
                )}
              </button>

              {/* Expiry info */}
              {shareStatus?.share_active_until && (
                <p className="text-sm text-muted-foreground">
                  Zugriff möglich bis {formatActiveUntil(shareStatus.share_active_until)}
                </p>
              )}

              {/* Link to share website */}
              <a
                href="https://migraina.lovable.app/doctor"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full py-2.5 px-4 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Freigabe-Website öffnen
              </a>

              {/* Privacy hint */}
              <p className="text-xs text-muted-foreground/60">
                Private Notizen werden nicht geteilt.
              </p>

              {/* Revoke – subtle */}
              <div className="pt-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      disabled={isPending}
                    >
                      Freigabe beenden
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Freigabe beenden?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Der Zugriff auf Ihre Daten wird sofort beendet. Sie können die Freigabe jederzeit erneut starten.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRevoke}>Beenden</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}

          {/* REVOKED TODAY – reactivate option */}
          {!isLoading && !fetchError && shareStatus && !isShareActive &&
            shareStatus.was_revoked_today && !justCreatedCode &&
            flowState !== "generating" && flowState !== "error" && (
            <div className="space-y-6">
              <div className="font-mono text-4xl font-bold tracking-widest text-muted-foreground/40">
                {shareStatus.code_display}
              </div>

              <p className="text-sm text-muted-foreground">Zugriff nicht aktiv</p>

              <Button
                onClick={handleActivate}
                variant="outline"
                size="sm"
                disabled={isPending}
              >
                {activateMutation.isPending ? "Wird aktiviert…" : "Für 24 Stunden freigeben"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFlowState("idle");
                  startGeneration();
                }}
              >
                Neue Freigabe einrichten
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorShareScreen;
