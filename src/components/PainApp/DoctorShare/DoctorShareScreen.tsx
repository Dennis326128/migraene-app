/**
 * DoctorShareScreen – "Per Code teilen"
 *
 * Minimal screen: Code + Toggle + Link
 * State machine: idle → generating → success | error
 * - No intermediate confirm step – generation starts immediately
 * - 20s timeout prevents infinite loading
 * - Skeleton UI while generating for psychological comfort
 * - Toggle controls 24h share window
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Copy, Check, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  useDoctorShareStatus,
  useActivateDoctorShare,
  useRevokeDoctorShare,
} from "@/features/doctor-share";
import { AppHeader } from "@/components/ui/app-header";
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
const SHARE_HINT_KEY = "migraina_share_auto_expire_hint_seen";

function addMonths(d: Date, m: number) {
  const dd = new Date(d);
  dd.setMonth(dd.getMonth() + m);
  return dd;
}
function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const DoctorShareScreen: React.FC<DoctorShareScreenProps> = ({ onBack }) => {
  const { data: shareStatus, isLoading, error: fetchError, refetch } = useDoctorShareStatus();
  const activateMutation = useActivateDoctorShare();
  const revokeMutation = useRevokeDoctorShare();
  const { data: medicationCourses = [] } = useMedicationCourses();

  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [justCreatedCode, setJustCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const abortRef = useRef(false);

  const today = useMemo(() => new Date(), []);
  const from = useMemo(() => fmt(addMonths(today, -3)), [today]);
  const to = useMemo(() => fmt(today), [today]);

  // Check if 24h hint was already shown
  const hintSeen = useRef(localStorage.getItem(SHARE_HINT_KEY) === "true");

  // Determine if we should auto-start generation
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

    // Show 24h hint on first use
    if (!hintSeen.current) {
      setShowHint(true);
      hintSeen.current = true;
      localStorage.setItem(SHARE_HINT_KEY, "true");
    }

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

  // Back handler
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

  // Toggle handler
  const handleToggle = (checked: boolean) => {
    if (checked) {
      // Reactivate
      if (!hintSeen.current) {
        setShowHint(true);
        hintSeen.current = true;
        localStorage.setItem(SHARE_HINT_KEY, "true");
      }
      activateMutation.mutate(undefined, {
        onSuccess: () => refetch(),
        onError: () => toast.error("Freigabe konnte nicht aktiviert werden"),
      });
    } else {
      // Revoke
      revokeMutation.mutate(undefined, {
        onSuccess: () => {
          refetch();
          setShowHint(false);
        },
        onError: () => toast.error("Freigabe konnte nicht beendet werden"),
      });
    }
  };

  const isPending = activateMutation.isPending || revokeMutation.isPending;
  const isShareActive = shareStatus?.is_share_active ?? false;
  const displayCode = justCreatedCode || shareStatus?.code_display;
  const isGenerating = flowState === "generating";
  const isReady = !isLoading && !fetchError && flowState !== "generating" && flowState !== "error" && (isShareActive || justCreatedCode || shareStatus?.was_revoked_today);

  // Check if share expired (auto-off)
  const isExpired = shareStatus && !isShareActive && shareStatus.share_active_until && !shareStatus.was_revoked_today;

  return (
    <div className="flex flex-col h-full bg-background">
      <AppHeader title="Per Code teilen" onBack={handleBack} sticky />

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-md space-y-5">

          {/* Initial loading */}
          {isLoading && (
            <div className="space-y-5">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-48 rounded-lg" />
            </div>
          )}

          {/* Fetch error */}
          {!isLoading && fetchError && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Der Code kann gerade nicht angezeigt werden.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* GENERATING state – skeleton with spinner */}
          {isGenerating && (
            <div className="space-y-5">
              {/* Loading indicator */}
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground">Freigabe wird erstellt…</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Das kann einen Moment dauern.
                  </p>
                </div>
              </div>

              {/* Skeleton code box */}
              <Skeleton className="h-20 w-full rounded-xl" />

              {/* Skeleton toggle row */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Freigabe aktiv</span>
                <Switch disabled checked={false} />
              </div>

              {/* Skeleton link button */}
              <Button variant="outline" size="sm" disabled className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Miary.de öffnen
              </Button>
            </div>
          )}

          {/* ERROR state */}
          {flowState === "error" && (
            <div className="space-y-4">
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

          {/* READY state – Code + Toggle + Link */}
          {isReady && (
            <div className="space-y-5">
              {/* Expired hint */}
              {isExpired && (
                <p className="text-sm text-muted-foreground">
                  Freigabe ist abgelaufen. Du kannst sie jederzeit erneut aktivieren.
                </p>
              )}

              {/* Code box – tappable to copy */}
              {displayCode && (
                <button
                  onClick={handleCopyCode}
                  className="bg-primary/5 border border-primary/20 rounded-xl px-8 py-6 cursor-pointer hover:bg-primary/10 active:scale-[0.98] transition-all duration-150 flex items-center gap-4 w-full"
                  aria-label="Code kopieren"
                >
                  <div className="font-mono text-4xl font-bold tracking-widest text-foreground">
                    {displayCode}
                  </div>
                  {copied ? (
                    <Check className="w-5 h-5 text-primary shrink-0" />
                  ) : (
                    <Copy className="w-5 h-5 text-muted-foreground/60 shrink-0" />
                  )}
                </button>
              )}

              {/* Toggle row */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Freigabe aktiv</span>
                <Switch
                  checked={isShareActive}
                  onCheckedChange={handleToggle}
                  disabled={isPending}
                />
              </div>

              {/* 24h hint – first use only */}
              {showHint && (
                <p className="text-xs text-muted-foreground">
                  Die Freigabe endet automatisch nach 24 Stunden.
                </p>
              )}

              {/* Link to share website */}
              <a
                href="https://miary.de"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 w-fit py-2.5 px-4 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm ${!isShareActive ? "pointer-events-none opacity-50" : ""}`}
                aria-disabled={!isShareActive}
              >
                <ExternalLink className="w-4 h-4" />
                Miary.de öffnen
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorShareScreen;
