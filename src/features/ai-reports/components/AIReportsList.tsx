/**
 * AI Reports List Component
 * Shows all saved AI analysis reports
 */

import React, { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowLeft, FileText, Trash2, ExternalLink, Loader2, Brain, Calendar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAIReports, useDeleteAIReport, type AIReport } from "@/features/ai-reports";
import { DeleteConfirmation } from "@/components/ui/delete-confirmation";
import { toast } from "sonner";

interface AIReportsListProps {
  onBack: () => void;
  onViewReport: (report: AIReport) => void;
}

function formatDateRange(from: string | null, to: string | null): string {
  if (!from && !to) return "Kein Zeitraum";
  
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  
  if (fromDate && toDate) {
    return `${format(fromDate, "d. MMM", { locale: de })} – ${format(toDate, "d. MMM yyyy", { locale: de })}`;
  }
  if (fromDate) return `Ab ${format(fromDate, "d. MMM yyyy", { locale: de })}`;
  if (toDate) return `Bis ${format(toDate, "d. MMM yyyy", { locale: de })}`;
  return "Kein Zeitraum";
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'pdf_flow': return 'PDF-Export';
    case 'analysis_view': return 'Analyse';
    case 'assistant': return 'Assistent';
    default: return source;
  }
}

export function AIReportsList({ onBack, onViewReport }: AIReportsListProps) {
  const { data: reports = [], isLoading, error } = useAIReports();
  const deleteReport = useDeleteAIReport();
  const [deleteTarget, setDeleteTarget] = useState<AIReport | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      await deleteReport.mutateAsync(deleteTarget.id);
      toast.success("Bericht gelöscht");
      setDeleteTarget(null);
    } catch (err) {
      toast.error("Fehler beim Löschen");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">KI-Berichte</h1>
        </div>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">KI-Berichte</h1>
        </div>
        <div className="p-4">
          <Card className="p-6 text-center text-destructive">
            Fehler beim Laden der Berichte
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            KI-Berichte
          </h1>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Intro text */}
        <p className="text-sm text-muted-foreground pb-2">
          Gespeicherte KI-Analyseberichte. Diese bleiben auch nach Ablauf eines Premium-Abos lesbar.
        </p>

        {reports.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Noch keine Berichte</h3>
                <p className="text-sm text-muted-foreground">
                  Erstelle deinen ersten KI-Analysebericht über die Musteranalyse oder das Kopfschmerztagebuch.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <Card
                key={report.id}
                className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => onViewReport(report)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="font-medium text-sm truncate">{report.title}</h3>
                    </div>
                    
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateRange(report.from_date, report.to_date)}
                      </span>
                      <span className="px-1.5 py-0.5 bg-muted rounded text-xs">
                        {getSourceLabel(report.source)}
                      </span>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mt-1">
                      Erstellt: {format(new Date(report.created_at), "d. MMM yyyy, HH:mm", { locale: de })}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewReport(report);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(report);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <DeleteConfirmation
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Bericht löschen?"
        description={`Der Bericht "${deleteTarget?.title}" wird unwiderruflich gelöscht.`}
        isDeleting={deleteReport.isPending}
      />
    </div>
  );
}
