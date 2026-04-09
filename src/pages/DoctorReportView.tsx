/**
 * DoctorReportView
 * Arzt-Ansicht des Patientenberichts (SSOT v1 Report Schema)
 * Route: /doctor/view
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { HeadacheDaysPie } from "@/components/diary/HeadacheDaysPie";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  LogOut,
  AlertTriangle,
  Calendar,
  Pill,
  Activity,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { buildPdfFilename } from "@/lib/pdf/filenameUtils";
import {
  SUPABASE_FUNCTIONS_BASE_URL,
  buildDoctorFetchInit,
  doctorAccessStore,
} from "@/features/doctor-share/doctorAccessStore";
import { safeDateFormat } from "@/lib/utils/safeParseDate";

// ═══════════════════════════════════════════════════════════════
// Types — aligned with DoctorReportJSON from Edge Function
// ═══════════════════════════════════════════════════════════════

interface ReportPeriod {
  fromDate: string;
  toDate: string;
  daysInRange: number;
  documentedDaysCount: number;
  entriesCount: number;
}

interface NormalizationConfig {
  enabled: boolean;
  targetDays: number;
  basisDays: number;
}

interface ReportMeta {
  range: string;
  fromDate: string;
  toDate: string;
  generatedAt: string;
  timezone: string;
  reportVersion: string;
  schemaVersion: string;
  period: ReportPeriod;
  normalization: NormalizationConfig;
}

interface CoreKPIs {
  painDays: number;
  migraineDays: number;
  triptanDays: number;
  acuteMedDays: number;
  auraDays: number;
  avgIntensity: number;
  totalTriptanIntakes: number;
}

interface NormalizedKPIs {
  painDaysPer30: number;
  migraineDaysPer30: number;
  triptanDaysPer30: number;
  triptanIntakesPer30: number;
  acuteMedDaysPer30: number;
}

interface ReportSummary {
  daysInRange: number;
  headacheDays: number;
  migraineDays: number;
  triptanDays: number;
  acuteMedDays: number;
  auraDays: number;
  avgIntensity: number;
  overuseWarning: boolean;
  kpis: CoreKPIs;
  normalizedKPIs: NormalizedKPIs;
  totalTriptanIntakes: number;
  documentationGaps: { gapDays: number; message: string };
}

interface ReportEntry {
  id: number;
  date: string;
  time: string | null;
  createdAt: string;
  intensity: number;
  intensityLabel: string;
  medications: string[];
  note: string | null;
  aura: string | null;
  painLocations: string[];
}

interface MedicationStat {
  name: string;
  intakeCount: number;
  avgEffect: number | null;
  effectCount: number;
  daysUsed?: number;
  avgPer30?: number;
  isTriptan?: boolean;
}

interface ProphylaxisCourse {
  id: string;
  name: string;
  doseText: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  effectiveness: number | null;
  sideEffects: string | null;
  discontinuationReason: string | null;
}

interface PatientData {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  fax: string | null;
  healthInsurance: string | null;
  insuranceNumber: string | null;
  salutation: string | null;
  title: string | null;
  email: string | null;
}

interface DoctorReportJSON {
  meta: ReportMeta;
  summary: ReportSummary;
  charts: {
    intensityOverTime: { date: string; maxIntensity: number; isMigraine: boolean }[];
    topAcuteMeds: { label: string; value: number; category?: string }[];
  };
  tables: {
    entries: ReportEntry[];
    entriesTotal: number;
    entriesPage: number;
    entriesPageSize: number;
    prophylaxisCourses: ProphylaxisCourse[];
    medicationStats: MedicationStat[];
    locationStats: Record<string, number>;
  };
  optional: {
    patientData?: PatientData;
  };
}

interface DoctorReportResponse {
  report: DoctorReportJSON;
  snapshotId: string;
  historyReport: {
    historyDiaryId: string;
    createdAt: string;
    pdfFilePath: string;
    title: string;
    isTodayDiary: boolean;
  } | null;
}

type RangeFilter = "30d" | "3m" | "6m" | "12m";

const RANGE_LABELS: Record<RangeFilter, string> = {
  "30d": "30 Tage",
  "3m": "3 Monate",
  "6m": "6 Monate",
  "12m": "1 Jahr",
};

const INTENSITY_LABELS: Record<string, string> = {
  "Kein Schmerz": "Kein Schmerz",
  "Leicht": "Leicht",
  "Mittel": "Mittel",
  "Stark": "Stark",
  "Sehr stark": "Sehr stark",
};

/** Sanitize filename: remove special characters */
function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

const DoctorReportView: React.FC = () => {
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);

  const [range, setRange] = useState<RangeFilter>("3m");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<DoctorReportJSON | null>(null);
  const [reportSnapshotId, setReportSnapshotId] = useState<string | null>(null);
  const [historyReport, setHistoryReport] = useState<DoctorReportResponse["historyReport"]>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const fmtDate = (dateStr: string | null | undefined) =>
    safeDateFormat(dateStr, (d) => format(d, "d. MMM yyyy", { locale: de }));

  const fmtDateShort = (dateStr: string | null | undefined) =>
    safeDateFormat(dateStr, (d) => format(d, "dd.MM.", { locale: de }));

  // ─── Data Loading with AbortController ─────────────────────
  const loadData = useCallback(async (currentRange: RangeFilter, currentPage: number) => {
    if (!doctorAccessStore.get()) {
      navigate("/doctor");
      return;
    }

    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${SUPABASE_FUNCTIONS_BASE_URL}/get-shared-report-data?range=${currentRange}&page=${currentPage}`,
        {
          method: "GET",
          ...buildDoctorFetchInit(),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          doctorAccessStore.clear();
          navigate("/doctor?expired=1");
          return;
        }
        throw new Error("Daten konnten nicht geladen werden");
      }

      const result: DoctorReportResponse = await response.json();

      if (!result.report?.meta || !result.report?.summary || !result.snapshotId) {
        setError("Ungültige Daten vom Server erhalten.");
        setReportSnapshotId(null);
        setHistoryReport(null);
        setIsLoading(false);
        return;
      }

      setReport(result.report);
      setReportSnapshotId(result.snapshotId);
      setHistoryReport(result.historyReport ?? null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("[DoctorReportView] Load error:", err);
      setError("Beim Laden des Berichts ist ein Fehler aufgetreten.");
      setReportSnapshotId(null);
      setHistoryReport(null);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [navigate]);

  useEffect(() => {
    loadData(range, page);
    return () => abortRef.current?.abort();
  }, [loadData, range, page]);

  const handleRangeChange = (newRange: RangeFilter) => {
    setReport(null); // Clear stale data immediately to prevent flash
    setReportSnapshotId(null);
    setRange(newRange);
    setPage(1);
  };

  // ─── PDF Download ──────────────────────────────────────────
  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      if (!historyReport?.historyDiaryId) {
        throw new Error("Das freigegebene Verlauf-PDF ist derzeit nicht verfügbar.");
      }

      const response = await fetch(
        `${SUPABASE_FUNCTIONS_BASE_URL}/get-shared-report-pdf?historyDiaryId=${encodeURIComponent(historyReport.historyDiaryId)}`,
        {
          method: "GET",
          ...buildDoctorFetchInit(),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          doctorAccessStore.clear();
          navigate("/doctor?expired=1");
          return;
        }
        // Try to extract a meaningful error message from the response
        let errorMsg = "Der Bericht konnte gerade nicht erstellt werden. Bitte versuchen Sie es erneut.";
        try {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const errData = await response.json();
            console.error("[DoctorReportView] PDF server error:", errData);
            if (typeof errData?.error === "string") {
              errorMsg = errData.error;
            }
          }
        } catch { /* ignore parse errors */ }
        throw new Error(errorMsg);
      }

      // Verify we actually got a PDF back (not a JSON error masquerading as 200)
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/pdf")) {
        console.error("[DoctorReportView] Unexpected content-type:", contentType);
        try {
          const body = await response.text();
          console.error("[DoctorReportView] Response body:", body.substring(0, 500));
        } catch { /* ignore */ }
        throw new Error("Der Bericht konnte gerade nicht erstellt werden. Bitte versuchen Sie es erneut.");
      }

      const blob = await response.blob();

      // Sanity check: PDF should start with %PDF
      if (blob.size < 10) {
        throw new Error("Der Bericht konnte gerade nicht erstellt werden. Bitte versuchen Sie es erneut.");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = historyReport.title
        ? `${sanitizeFilename(historyReport.title.replace(/\s+/g, "_"))}_${historyReport.createdAt.slice(0, 10)}.pdf`
        : buildPdfFilename({
            lastName: report?.optional?.patientData?.lastName || undefined,
            firstName: report?.optional?.patientData?.firstName || undefined,
            fromDate: report?.meta.fromDate ?? new Date().toISOString().split('T')[0],
            toDate: report?.meta.toDate ?? new Date().toISOString().split('T')[0],
            reportType: 'diary',
          });
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("PDF heruntergeladen");
    } catch (err) {
      console.error("[DoctorReportView] PDF error:", err);
      const msg = err instanceof Error ? err.message : "PDF-Download fehlgeschlagen";
      toast.error(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleLogout = () => {
    doctorAccessStore.clear();
    navigate("/doctor");
  };

  // ─── Derived values ────────────────────────────────────────
  const meta = report?.meta;
  const summary = report?.summary;
  const tables = report?.tables;
  const nkpis = summary?.normalizedKPIs;
  const kpis = summary?.kpis;
  const period = meta?.period;
  const daysInRange = period?.daysInRange ?? summary?.daysInRange ?? 1;
  const totalPages = tables ? Math.ceil(tables.entriesTotal / tables.entriesPageSize) : 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg">Kopfschmerztagebuch</h1>
            {meta && (
              <p className="text-sm text-muted-foreground">
                {fmtDate(meta.fromDate)} – {fmtDate(meta.toDate)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isDownloading || isLoading}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="w-4 h-4" />
              Abmelden
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Range Filter */}
        <Tabs value={range} onValueChange={(v) => handleRangeChange(v as RangeFilter)}>
          <TabsList className="grid w-full grid-cols-4">
            {(Object.keys(RANGE_LABELS) as RangeFilter[]).map((r) => (
              <TabsTrigger key={r} value={r}>
                {RANGE_LABELS[r]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-6">
            <div className="text-center py-8">
              <p className="text-muted-foreground">Bericht wird geladen…</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" onClick={() => loadData(range, page)}>
                Erneut versuchen
              </Button>
            </CardContent>
          </Card>
        ) : report && summary && tables ? (
          <>
            {/* Patient Data */}
            {report.optional?.patientData && (() => {
              const p = report.optional.patientData;
              const address = [p.street, [p.postalCode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
              const nameDisplay = p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ");
              const hasAnyData = nameDisplay || p.dateOfBirth || address || p.healthInsurance || p.insuranceNumber || p.phone || p.fax || p.email;
              if (!hasAnyData) return null;
              return (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Patientenstammdaten
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                      {nameDisplay && (
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Name</span>
                          <span className="font-medium">{[p.salutation, p.title, nameDisplay].filter(Boolean).join(" ")}</span>
                        </div>
                      )}
                      {p.dateOfBirth && (
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Geburtsdatum</span>
                          <span className="font-medium">{fmtDate(p.dateOfBirth)}</span>
                        </div>
                      )}
                      {address && (
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Adresse</span>
                          <span className="font-medium">{address}</span>
                        </div>
                      )}
                      {p.healthInsurance && (
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Krankenversicherung</span>
                          <span className="font-medium">{p.healthInsurance}</span>
                        </div>
                      )}
                      {p.insuranceNumber && (
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Versicherungsnummer</span>
                          <span className="font-medium">{p.insuranceNumber}</span>
                        </div>
                      )}
                      {p.phone && (
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Telefon</span>
                          <span className="font-medium">{p.phone}</span>
                        </div>
                      )}
                      {p.fax && (
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">Fax</span>
                          <span className="font-medium">{p.fax}</span>
                        </div>
                      )}
                      {p.email && (
                        <div className="flex justify-between py-1 border-b">
                          <span className="text-muted-foreground">E-Mail</span>
                          <span className="font-medium">{p.email}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">Kopfschmerztage / 30 Tage</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {nkpis?.painDaysPer30?.toFixed(1) ?? "-"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs">Migränetage (roh)</span>
                  </div>
                  <p className="text-2xl font-bold">{kpis?.migraineDays ?? summary.migraineDays}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Pill className="w-4 h-4" />
                    <span className="text-xs">
                      {nkpis?.triptanIntakesPer30 != null ? "Triptan-Einnahmen / 30 Tage" : "Triptantage / 30 Tage"}
                    </span>
                  </div>
                  <p className="text-2xl font-bold">
                    {nkpis?.triptanIntakesPer30?.toFixed(1) ?? nkpis?.triptanDaysPer30?.toFixed(1) ?? "-"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs">Ø Intensität</span>
                  </div>
                  <p className="text-2xl font-bold">{summary.avgIntensity}</p>
                </CardContent>
              </Card>
            </div>

            {/* Pie Chart */}
            {daysInRange > 0 && (() => {
              const headacheDays = kpis?.painDays ?? summary.headacheDays;
              const triptanDays = kpis?.triptanDays ?? summary.triptanDays;
              const painNoTriptan = Math.max(0, headacheDays - triptanDays);
              const painFree = Math.max(0, daysInRange - headacheDays);

              return (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-muted-foreground mb-3">Tagesverteilung</p>
                    <HeadacheDaysPie
                      totalDays={daysInRange}
                      painFreeDays={painFree}
                      painDaysNoTriptan={painNoTriptan}
                      triptanDays={triptanDays}
                    />
                  </CardContent>
                </Card>
              );
            })()}

            {/* Extended Summary Table */}
            <Card>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2 text-muted-foreground">Tage im Zeitraum</td>
                        <td className="py-2 text-right font-medium">{daysInRange}</td>
                      </tr>
                      {period?.documentedDaysCount != null && (
                        <tr className="border-b">
                          <td className="py-2 text-muted-foreground">davon dokumentiert</td>
                          <td className="py-2 text-right font-medium">{period.documentedDaysCount}</td>
                        </tr>
                      )}
                      <tr className="border-b">
                        <td className="py-2 text-muted-foreground">Einträge gesamt</td>
                        <td className="py-2 text-right font-medium">{tables.entriesTotal}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 text-muted-foreground">Schmerztage (roh)</td>
                        <td className="py-2 text-right font-medium">{summary.headacheDays}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 text-muted-foreground">Triptantage (roh)</td>
                        <td className="py-2 text-right font-medium">{summary.triptanDays}</td>
                      </tr>
                      {summary.totalTriptanIntakes > 0 && (
                        <tr className="border-b">
                          <td className="py-2 text-muted-foreground">Triptan-Einnahmen gesamt</td>
                          <td className="py-2 text-right font-medium">{summary.totalTriptanIntakes}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-2 text-muted-foreground">Ø pro 30 Tage (normiert)</td>
                        <td className="py-2 text-right font-medium">
                          Schmerzen {nkpis?.painDaysPer30?.toFixed(1) ?? "-"} ·{" "}
                          {nkpis?.triptanIntakesPer30 != null
                            ? `Triptan ${nkpis.triptanIntakesPer30.toFixed(1)} Einnahmen`
                            : `Triptan ${nkpis?.triptanDaysPer30?.toFixed(1) ?? "-"} Tage`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Overuse Warning */}
            {summary.overuseWarning && (
              <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Hinweis: Erhöhte Akutmedikation
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      {summary.acuteMedDays} Tage mit Akutmedikation im Zeitraum.
                      Bei &gt;10 Tagen/Monat besteht Übergebrauchsrisiko.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Medication Stats */}
            {tables.medicationStats.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Akutmedikation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Medikament</th>
                          <th className="text-right py-2 font-medium">Einnahmen</th>
                          <th className="text-right py-2 font-medium">Ø Wirkung</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tables.medicationStats.slice(0, 10).map((stat, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2">{stat.name}</td>
                            <td className="text-right py-2">{stat.intakeCount}</td>
                            <td className="text-right py-2">
                              {stat.avgEffect != null ? `${stat.avgEffect}/4` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Entries List */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  Dokumentierte Tage ({tables.entriesTotal})
                </CardTitle>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {tables.entries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Noch keine Einträge im gewählten Zeitraum.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Datum</th>
                          <th className="text-left py-2 font-medium">Intensität</th>
                          <th className="text-left py-2 font-medium">Medikamente</th>
                          <th className="text-left py-2 font-medium">Notizen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tables.entries.map((entry) => (
                          <tr key={entry.id} className="border-b last:border-0">
                            <td className="py-2 whitespace-nowrap">
                              {fmtDateShort(entry.date)}
                              {entry.time && (
                                <span className="text-muted-foreground ml-1">
                                  {entry.time.substring(0, 5)}
                                </span>
                              )}
                            </td>
                            <td className="py-2">
                              {INTENSITY_LABELS[entry.intensityLabel] || entry.intensityLabel}
                            </td>
                            <td className="py-2 max-w-[200px] truncate">
                              {entry.medications.length > 0 ? entry.medications.join(", ") : "-"}
                            </td>
                            <td className="py-2 max-w-[200px] truncate text-muted-foreground">
                              {entry.note || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Download Button (Bottom) */}
            <div className="flex justify-center">
              <Button
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                size="lg"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                {isDownloading ? "PDF wird erstellt..." : "PDF herunterladen"}
              </Button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default DoctorReportView;
