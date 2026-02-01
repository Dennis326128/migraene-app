/**
 * DoctorReportView
 * Arzt-Ansicht des Patientenberichts
 * Route: /doctor/view
 */

import React, { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import {
  SUPABASE_FUNCTIONS_BASE_URL,
  buildDoctorFetchInit,
  doctorSessionFallback,
} from "@/features/doctor-share/doctorSessionFallback";

// Types
interface ReportSummary {
  headache_days: number;
  migraine_days: number;
  triptan_days: number;
  acute_med_days: number;
  avg_intensity: number;
  overuse_warning: boolean;
  // NEU: Erweiterte KPIs vom Snapshot
  total_triptan_intakes?: number;
  kpis?: {
    painDays: number;
    migraineDays: number;
    triptanDays: number;
    acuteMedDays: number;
    auraDays: number;
    avgIntensity: number;
    totalTriptanIntakes: number;
  };
  normalizedKPIs?: {
    painDaysPer30: number;
    migraineDaysPer30: number;
    triptanDaysPer30: number;
    triptanIntakesPer30: number;
    acuteMedDaysPer30: number;
  };
}

interface ChartData {
  dates: string[];
  pain_levels: number[];
}

interface MedicationStat {
  name: string;
  intake_count: number;
  avg_effect: number | null;
  effect_count: number;
  // NEU: Erweiterte Felder
  days_used?: number;
  avg_per_30?: number;
  is_triptan?: boolean;
}

interface PainEntry {
  id: number;
  selected_date: string;
  selected_time: string | null;
  pain_level: string;
  aura_type: string | null;
  medications: string[] | null;
  notes: string | null;
}

interface ReportPeriod {
  fromDate: string;
  toDate: string;
  daysInRange: number;
  documentedDaysCount: number;
  entriesCount: number;
}

interface ReportData {
  summary: ReportSummary;
  chart_data: ChartData;
  entries: PainEntry[];
  entries_total: number;
  entries_page: number;
  entries_page_size: number;
  medication_stats: MedicationStat[];
  from_date: string;
  to_date: string;
  // NEU: Erweiterte Metadaten vom Snapshot
  report?: {
    meta?: {
      period?: ReportPeriod;
      normalization?: {
        enabled: boolean;
        targetDays: number;
        basisDays: number;
      };
    };
  };
}

type RangeFilter = "30d" | "3m" | "6m" | "12m";

const RANGE_LABELS: Record<RangeFilter, string> = {
  "30d": "30 Tage",
  "3m": "3 Monate",
  "6m": "6 Monate",
  "12m": "1 Jahr",
};

const PAIN_LEVEL_LABELS: Record<string, string> = {
  "-": "Kein Schmerz",
  leicht: "Leicht",
  mittel: "Mittel",
  stark: "Stark",
  sehr_stark: "Sehr stark",
};

const DoctorReportView: React.FC = () => {
  const navigate = useNavigate();

  const [range, setRange] = useState<RangeFilter>("3m");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [expiredMessage, setExpiredMessage] = useState<string | null>(null);

  // Session-Ping Interval
  const pingSession = useCallback(async () => {
    try {
      const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/ping-doctor-session`, {
        method: "POST",
        ...buildDoctorFetchInit(),
      });

      const result = await response.json();

      if (!response.ok || !result.active) {
        // Session abgelaufen → zurück zur Code-Eingabe
        setExpiredMessage("Sitzung abgelaufen");
        doctorSessionFallback.clear();
        navigate("/doctor?expired=1");
      }
    } catch {
      // Fehler ignorieren, beim nächsten Ping erneut versuchen
    }
  }, [navigate]);

  // Daten laden
  const loadData = useCallback(async (currentRange: RangeFilter, currentPage: number) => {
    setIsLoading(true);
    setError(null);
    setExpiredMessage(null);

    try {
      const response = await fetch(
        `${SUPABASE_FUNCTIONS_BASE_URL}/get-shared-report-data?range=${currentRange}&page=${currentPage}`,
        {
          method: "GET",
          ...buildDoctorFetchInit(),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          setExpiredMessage("Sitzung abgelaufen");
          doctorSessionFallback.clear();
          navigate("/doctor?expired=1");
          return;
        }
        throw new Error("Daten konnten nicht geladen werden");
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error("Load error:", err);
      setError("Fehler beim Laden der Daten");
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  // Initial laden + Ping-Interval
  useEffect(() => {
    loadData(range, page);

    // Ping alle 5 Minuten
    const pingInterval = setInterval(pingSession, 5 * 60 * 1000);

    // Activity-basierter Ping
    const handleActivity = () => pingSession();
    window.addEventListener("click", handleActivity, { passive: true });
    window.addEventListener("scroll", handleActivity, { passive: true });

    return () => {
      clearInterval(pingInterval);
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("scroll", handleActivity);
    };
  }, [loadData, pingSession, range, page]);

  // Range ändern
  const handleRangeChange = (newRange: RangeFilter) => {
    setRange(newRange);
    setPage(1);
    loadData(newRange, 1);
  };

  // PDF herunterladen
  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(
        `${SUPABASE_FUNCTIONS_BASE_URL}/get-shared-report-pdf?range=${range}`,
        {
          method: "GET",
          ...buildDoctorFetchInit(),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          doctorSessionFallback.clear();
          navigate("/doctor?expired=1");
          return;
        }
        throw new Error("PDF konnte nicht erstellt werden");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Kopfschmerztagebuch_${data?.from_date}_${data?.to_date}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("PDF heruntergeladen");
    } catch (err) {
      console.error("Download error:", err);
      toast.error("PDF-Download fehlgeschlagen");
    } finally {
      setIsDownloading(false);
    }
  };

  // Abmelden
  const handleLogout = () => {
    // Cookie wird serverseitig nicht aktiv gelöscht, aber Session läuft ab
    doctorSessionFallback.clear();
    navigate("/doctor");
  };

  const computeDaysInRange = (fromDate: string, toDate: string) => {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const ms = to.getTime() - from.getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, days);
  };

  const formatPer30 = (value: number, daysInRange: number) => {
    const per30 = (value / daysInRange) * 30;
    return per30.toFixed(1);
  };

  // Formatierung
  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "d. MMM yyyy", { locale: de });
  };

  const formatDateShort = (dateStr: string) => {
    return format(new Date(dateStr), "dd.MM.", { locale: de });
  };

  // Pagination
  const totalPages = data ? Math.ceil(data.entries_total / data.entries_page_size) : 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg">Kopfschmerztagebuch</h1>
            {data && (
              <p className="text-sm text-muted-foreground">
                {formatDate(data.from_date)} – {formatDate(data.to_date)}
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
            <CardContent className="py-8 text-center">
              <p className="text-destructive">{error}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => loadData(range, page)}
              >
                Erneut versuchen
              </Button>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            {/* Expired Message (rare, but keep UX clear) */}
            {expiredMessage && (
              <Card>
                <CardContent className="py-4 text-center text-muted-foreground">
                  {expiredMessage}
                </CardContent>
              </Card>
            )}

            {/* Summary Cards - Nutze normalizedKPIs wenn vorhanden, sonst berechne */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(() => {
                // Nutze erweiterte KPIs wenn vorhanden
                const nkpis = data.summary.normalizedKPIs;
                const daysInRange = data.report?.meta?.period?.daysInRange 
                  ?? computeDaysInRange(data.from_date, data.to_date);
                
                // Bevorzuge Server-berechnete Werte, Fallback auf Client-Berechnung
                const headachePer30 = nkpis?.painDaysPer30?.toFixed(1) 
                  ?? formatPer30(data.summary.headache_days, daysInRange);
                const triptanPer30 = nkpis?.triptanDaysPer30?.toFixed(1) 
                  ?? formatPer30(data.summary.triptan_days, daysInRange);
                const triptanIntakesPer30 = nkpis?.triptanIntakesPer30?.toFixed(1) 
                  ?? (data.summary.total_triptan_intakes 
                      ? formatPer30(data.summary.total_triptan_intakes, daysInRange) 
                      : null);

                return (
                  <>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">Kopfschmerztage / 30 Tage</span>
                  </div>
                  <p className="text-2xl font-bold">{headachePer30}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs">Migränetage (roh)</span>
                  </div>
                  <p className="text-2xl font-bold">{data.summary.migraine_days}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Pill className="w-4 h-4" />
                    <span className="text-xs">
                      {triptanIntakesPer30 ? "Triptan-Einnahmen / 30 Tage" : "Triptantage / 30 Tage"}
                    </span>
                  </div>
                  <p className="text-2xl font-bold">{triptanIntakesPer30 || triptanPer30}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs">Ø Intensität</span>
                  </div>
                  <p className="text-2xl font-bold">{data.summary.avg_intensity}</p>
                </CardContent>
              </Card>
                  </>
                );
              })()}
            </div>

            {/* Erweiterte Zusammenfassung mit Normalisierung */}
            {(() => {
              const period = data.report?.meta?.period;
              const daysInRange = period?.daysInRange ?? computeDaysInRange(data.from_date, data.to_date);
              const nkpis = data.summary.normalizedKPIs;
              const headachePer30 = nkpis?.painDaysPer30?.toFixed(1) ?? formatPer30(data.summary.headache_days, daysInRange);
              const triptanPer30 = nkpis?.triptanDaysPer30?.toFixed(1) ?? formatPer30(data.summary.triptan_days, daysInRange);
              const triptanIntakesPer30 = nkpis?.triptanIntakesPer30;
              
              return (
                <Card>
                  <CardContent className="p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-b">
                            <td className="py-2 text-muted-foreground">Tage im Zeitraum</td>
                            <td className="py-2 text-right font-medium">{daysInRange}</td>
                          </tr>
                          {period?.documentedDaysCount !== undefined && (
                            <tr className="border-b">
                              <td className="py-2 text-muted-foreground">davon dokumentiert</td>
                              <td className="py-2 text-right font-medium">{period.documentedDaysCount}</td>
                            </tr>
                          )}
                          <tr className="border-b">
                            <td className="py-2 text-muted-foreground">Einträge gesamt</td>
                            <td className="py-2 text-right font-medium">{data.entries_total}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2 text-muted-foreground">Schmerztage (roh)</td>
                            <td className="py-2 text-right font-medium">{data.summary.headache_days}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2 text-muted-foreground">Triptantage (roh)</td>
                            <td className="py-2 text-right font-medium">{data.summary.triptan_days}</td>
                          </tr>
                          {data.summary.total_triptan_intakes !== undefined && (
                            <tr className="border-b">
                              <td className="py-2 text-muted-foreground">Triptan-Einnahmen gesamt</td>
                              <td className="py-2 text-right font-medium">{data.summary.total_triptan_intakes}</td>
                            </tr>
                          )}
                          <tr>
                            <td className="py-2 text-muted-foreground">Ø pro 30 Tage (normiert)</td>
                            <td className="py-2 text-right font-medium">
                              Schmerzen {headachePer30} · 
                              {triptanIntakesPer30 !== undefined 
                                ? ` Triptan ${triptanIntakesPer30.toFixed(1)} Einnahmen`
                                : ` Triptan ${triptanPer30} Tage`
                              }
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Overuse Warning */}
            {data.summary.overuse_warning && (
              <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Hinweis: Erhöhte Akutmedikation
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      {data.summary.acute_med_days} Tage mit Akutmedikation im Zeitraum.
                      Bei &gt;10 Tagen/Monat besteht Übergebrauchsrisiko.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Medication Stats */}
            {data.medication_stats.length > 0 && (
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
                        {data.medication_stats.slice(0, 10).map((stat, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2">{stat.name}</td>
                            <td className="text-right py-2">{stat.intake_count}</td>
                            <td className="text-right py-2">
                              {stat.avg_effect !== null
                                ? `${stat.avg_effect}/4`
                                : "-"}
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
                  Einträge ({data.entries_total})
                </CardTitle>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={page <= 1}
                      onClick={() => {
                        setPage((p) => p - 1);
                        loadData(range, page - 1);
                      }}
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
                      onClick={() => {
                        setPage((p) => p + 1);
                        loadData(range, page + 1);
                      }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {data.entries.length === 0 ? (
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
                        {data.entries.map((entry) => (
                          <tr key={entry.id} className="border-b last:border-0">
                            <td className="py-2 whitespace-nowrap">
                              {formatDateShort(entry.selected_date)}
                              {entry.selected_time && (
                                <span className="text-muted-foreground ml-1">
                                  {entry.selected_time.substring(0, 5)}
                                </span>
                              )}
                            </td>
                            <td className="py-2">
                              {PAIN_LEVEL_LABELS[entry.pain_level] || entry.pain_level}
                            </td>
                            <td className="py-2 max-w-[200px] truncate">
                              {entry.medications?.join(", ") || "-"}
                            </td>
                            <td className="py-2 max-w-[200px] truncate text-muted-foreground">
                              {entry.notes || "-"}
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
