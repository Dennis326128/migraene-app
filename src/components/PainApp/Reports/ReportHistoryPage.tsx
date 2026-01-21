import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, Trash2, FileText, Pill, ClipboardList, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { 
  useGeneratedReports, 
  useDeleteGeneratedReport,
  useDownloadGeneratedReport,
  getReportTypeLabel,
  type ReportType,
} from "@/features/reports";

interface ReportHistoryPageProps {
  onBack: () => void;
  onCreateReport?: () => void;
}

const REPORT_TYPE_ICONS: Record<ReportType, React.ReactNode> = {
  diary: <FileText className="h-5 w-5 text-primary" />,
  medication_plan: <Pill className="h-5 w-5 text-blue-500" />,
  hit6: <ClipboardList className="h-5 w-5 text-orange-500" />,
};

export const ReportHistoryPage: React.FC<ReportHistoryPageProps> = ({
  onBack,
  onCreateReport,
}) => {
  const { data: reports, isLoading } = useGeneratedReports();
  const deleteReport = useDeleteGeneratedReport();
  const downloadReport = useDownloadGeneratedReport();
  
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | ReportType>('all');

  // Group reports by type for tabs visibility
  const reportsByType = useMemo(() => {
    const grouped: Record<ReportType, typeof reports> = {
      diary: [],
      medication_plan: [],
      hit6: [],
    };
    
    (reports || []).forEach(r => {
      const type = r.report_type as ReportType;
      if (grouped[type]) {
        grouped[type]!.push(r);
      }
    });
    
    return grouped;
  }, [reports]);

  // Filtered reports based on active tab
  const filteredReports = useMemo(() => {
    if (activeTab === 'all') return reports || [];
    return reportsByType[activeTab] || [];
  }, [activeTab, reports, reportsByType]);

  // Check which tabs should be visible
  const visibleTabs = useMemo(() => {
    const tabs: Array<'all' | ReportType> = ['all'];
    if (reportsByType.diary?.length) tabs.push('diary');
    if (reportsByType.medication_plan?.length) tabs.push('medication_plan');
    if (reportsByType.hit6?.length) tabs.push('hit6');
    return tabs;
  }, [reportsByType]);

  const handleDownload = (id: string, title: string, createdAt: string) => {
    const dateStr = format(new Date(createdAt), 'yyyy-MM-dd');
    const filename = `${title.replace(/\s+/g, '_')}_${dateStr}.pdf`;
    downloadReport.mutate({ id, filename });
  };

  const handleDelete = () => {
    if (deletingId) {
      deleteReport.mutate(deletingId, {
        onSuccess: () => setDeletingId(null),
      });
    }
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "d. MMMM yyyy", { locale: de });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEmpty = !reports?.length;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Verlauf</h1>
          </div>
        </div>

        {/* Empty State */}
        {isEmpty && (
          <div className="text-center py-12 space-y-4">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">
              Hier erscheinen deine erstellten Berichte & PDFs.
            </p>
            {onCreateReport && (
              <Button onClick={onCreateReport} variant="outline">
                Bericht erstellen
              </Button>
            )}
          </div>
        )}

        {/* Reports List */}
        {!isEmpty && (
          <>
            {/* Tabs - only show if multiple types exist */}
            {visibleTabs.length > 2 && (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="w-full grid grid-cols-4">
                  <TabsTrigger value="all">Alle</TabsTrigger>
                  {visibleTabs.includes('diary') && (
                    <TabsTrigger value="diary">Tagebuch</TabsTrigger>
                  )}
                  {visibleTabs.includes('medication_plan') && (
                    <TabsTrigger value="medication_plan">Medikation</TabsTrigger>
                  )}
                  {visibleTabs.includes('hit6') && (
                    <TabsTrigger value="hit6">HIT-6</TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            )}

            {/* Report Cards */}
            <div className="space-y-3">
              {filteredReports.map((report) => (
                <Card key={report.id} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="p-2 rounded-lg bg-muted shrink-0 mt-0.5">
                        {REPORT_TYPE_ICONS[report.report_type as ReportType]}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block">
                          {getReportTypeLabel(report.report_type as ReportType)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(report.created_at)}
                        </span>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(report.id, report.title, report.created_at)}
                          disabled={downloadReport.isPending}
                          className="gap-1.5 text-xs"
                        >
                          {downloadReport.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          PDF herunterladen
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingId(report.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bericht löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchtest du diesen Bericht wirklich löschen?
                Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteReport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default ReportHistoryPage;
