import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Brain, Loader2, Calendar as CalendarIcon, RefreshCw, ChevronDown, ChevronRight, Activity, Cloud, Pill, Database, Clock, Tag, Info, FileText, TrendingUp, Sparkles, ExternalLink, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { subMonths, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { logError } from '@/lib/utils/errorMessages';
import { formatDateRangeDE, formatDateDE, formatNumberSmart, formatLastUpdated } from '@/lib/formatters';
import { useAIReports, useDeleteAIReport, type AIReport } from '@/features/ai-reports';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { toast } from 'sonner';
import { PremiumBadge } from '@/components/ui/premium-badge';

// Structured analysis types
interface StructuredAnalysis {
  schemaVersion: number;
  timeRange: { from: string; to: string };
  dataCoverage: {
    entries: number;
    notes: number;
    weatherDays: number;
    medDays: number;
    prophylaxisCourses: number;
  };
  overview: {
    headline: string;
    disclaimer: string;
  };
  keyFindings: Array<{
    title: string;
    finding: string;
    evidence: string;
    confidence: 'low' | 'medium' | 'high';
  }>;
  sections: Array<{
    id: string;
    title: string;
    bullets?: string[];
    evidence?: string[];
    subsections?: Array<{
      title: string;
      bullets: string[];
      evidence?: string[];
    }>;
    beforeAfter?: Array<{
      medication: string;
      window: string;
      before: string;
      after: string;
      note: string;
    }>;
  }>;
  tagsFromNotes: Array<{ tag: string; count: number }>;
}

// Quota info from backend
interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  cooldownRemaining: number;
}

interface AnalysisResult {
  requestId?: string;
  structured?: StructuredAnalysis;
  insights?: string; // Legacy fallback
  analyzed_entries: number;
  voice_notes_count: number;
  total_analyzed: number;
  has_weather_data: boolean;
  ai_available?: boolean;
  date_range: { from: string; to: string };
  cached?: boolean;
  cachedAt?: string;
  quota?: QuotaInfo;
  tags?: {
    total_tags: number;
    unique_tags: number;
    top_tags: Array<{ tag: string; label: string; count: number }>;
    top_hashtags: Array<{ tag: string; count: number }>;
  };
}

// Simplified error state - no technical details exposed to UI
interface AnalysisErrorState {
  hasError: boolean;
  errorCode?: 'COOLDOWN' | 'QUOTA_EXCEEDED' | 'GENERIC';
  cooldownRemaining?: number;
  quota?: QuotaInfo;
  // Internal only for logging
  _internalRequestId?: string;
  _internalError?: string;
}

// Icon mapping for sections
const sectionIcons: Record<string, React.ReactNode> = {
  timeOfDay: <Clock className="h-4 w-4" />,
  weather: <Cloud className="h-4 w-4" />,
  medication: <Pill className="h-4 w-4" />,
  dataQuality: <Database className="h-4 w-4" />,
};

// Confidence badge colors
const confidenceColors: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const labels: Record<string, string> = { low: 'Gering', medium: 'Mittel', high: 'Hoch' };
  return (
    <Badge variant="outline" className={cn('text-xs', confidenceColors[confidence] || '')}>
      {labels[confidence] || confidence}
    </Badge>
  );
}

// Key Finding Card
function KeyFindingCard({ finding }: { finding: StructuredAnalysis['keyFindings'][0] }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-sm">{finding.title}</h4>
        <ConfidenceBadge confidence={finding.confidence} />
      </div>
      <p className="text-sm text-foreground mb-2">{finding.finding}</p>
      <p className="text-xs text-muted-foreground">{finding.evidence}</p>
    </Card>
  );
}

// Collapsible Section
function AnalysisSection({ section }: { section: StructuredAnalysis['sections'][0] }) {
  const [isOpen, setIsOpen] = useState(true);
  const Icon = sectionIcons[section.id] || <Activity className="h-4 w-4" />;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 px-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
        {Icon}
        <span className="font-medium text-sm flex-1 text-left">{section.title}</span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 pb-1 px-4">
        {/* Main bullets */}
        {section.bullets && section.bullets.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {section.bullets.map((bullet, idx) => (
              <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-muted-foreground mt-1.5">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Evidence */}
        {section.evidence && section.evidence.length > 0 && (
          <div className="text-xs text-muted-foreground mb-3 pl-4 border-l-2 border-border">
            {section.evidence.map((e, idx) => (
              <p key={idx}>{e}</p>
            ))}
          </div>
        )}

        {/* Subsections */}
        {section.subsections && section.subsections.length > 0 && (
          <div className="space-y-3 mt-3">
            {section.subsections.map((sub, idx) => (
              <div key={idx} className="pl-4 border-l-2 border-primary/20">
                <h5 className="text-sm font-medium mb-1">{sub.title}</h5>
                <ul className="space-y-1">
                  {sub.bullets.map((b, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span>•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                {sub.evidence && (
                  <p className="text-xs text-muted-foreground/70 mt-1">{sub.evidence.join(' ')}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Before/After comparison */}
        {section.beforeAfter && section.beforeAfter.length > 0 && (
          <div className="space-y-3 mt-3">
            <h5 className="text-sm font-medium">Prophylaxe-Verläufe</h5>
            {section.beforeAfter.map((ba, idx) => (
              <div key={idx} className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">{ba.medication}</Badge>
                  <span className="text-xs text-muted-foreground">{ba.window}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Vorher</p>
                    <p>{ba.before}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Nachher</p>
                    <p>{ba.after}</p>
                  </div>
                </div>
                {ba.note && (
                  <p className="text-xs text-muted-foreground mt-2">{ba.note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Tags display
function TagsDisplay({ tags }: { tags: StructuredAnalysis['tagsFromNotes'] }) {
  if (!tags || tags.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t, idx) => (
        <Badge key={idx} variant="secondary" className="text-xs">
          <Tag className="h-3 w-3 mr-1" />
          {t.tag} ({formatNumberSmart(t.count)}×)
        </Badge>
      ))}
    </div>
  );
}

// Structured Results Display with sections
function StructuredResultsDisplay({ 
  data, 
  dateRange,
  lastUpdated 
}: { 
  data: StructuredAnalysis;
  dateRange: { from: Date; to: Date };
  lastUpdated: Date;
}) {
  const formattedDateRange = formatDateRangeDE(dateRange.from, dateRange.to);
  const totalEntries = data.dataCoverage.entries + data.dataCoverage.notes;
  
  return (
    <div className="space-y-6">
      {/* Header with date range and last updated */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarIcon className="h-4 w-4" />
          <span>Zeitraum: {formattedDateRange}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Zuletzt aktualisiert: {formatLastUpdated(lastUpdated)}
        </div>
      </div>

      {/* Overview Card */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <h3 className="font-semibold mb-2">{data.overview.headline}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="text-center">
              <div className="text-2xl font-bold">{formatNumberSmart(data.dataCoverage.entries)}</div>
              <div className="text-xs text-muted-foreground">Einträge</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatNumberSmart(data.dataCoverage.notes)}</div>
              <div className="text-xs text-muted-foreground">Notizen</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatNumberSmart(data.dataCoverage.weatherDays)}</div>
              <div className="text-xs text-muted-foreground">Wetter-Tage</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatNumberSmart(data.dataCoverage.prophylaxisCourses)}</div>
              <div className="text-xs text-muted-foreground">Prophylaxen</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Hinweis: {data.overview.disclaimer}
          </p>
        </CardContent>
      </Card>

      {/* Data sufficiency check */}
      {totalEntries < 10 && (
        <Card className="border-muted bg-muted/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h4 className="font-medium text-sm mb-1">Noch wenige Daten vorhanden</h4>
                <p className="text-sm text-muted-foreground">
                  Noch zu wenige Einträge für eine verlässliche Musteranalyse. 
                  Sobald du mehr dokumentierst, wird die Auswertung aussagekräftiger.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Basierend auf {formatNumberSmart(totalEntries)} Einträgen im gewählten Zeitraum.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 1: Key Findings / Wichtigste Muster */}
      {data.keyFindings && data.keyFindings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Wichtigste Muster</h3>
            <Badge variant="outline" className="text-xs ml-auto">Hinweis</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.keyFindings.map((finding, idx) => (
              <KeyFindingCard key={idx} finding={finding} />
            ))}
          </div>
        </div>
      )}

      {/* Section 2: Trends */}
      {data.sections && data.sections.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Trends & Details</h3>
            <Badge variant="outline" className="text-xs ml-auto">Hinweis</Badge>
          </div>
          <div className="space-y-2">
            {data.sections.map((section, idx) => (
              <AnalysisSection key={idx} section={section} />
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Tags from Notes / Mögliche Zusammenhänge */}
      {data.tagsFromNotes && data.tagsFromNotes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Mögliche Zusammenhänge</h3>
            <Badge variant="outline" className="text-xs ml-auto">Hinweis</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Erkannte Kontext-Faktoren aus deinen Notizen:
          </p>
          <TagsDisplay tags={data.tagsFromNotes} />
        </div>
      )}

      {/* Basis info */}
      {totalEntries >= 10 && (
        <p className="text-xs text-muted-foreground text-center pt-2 border-t">
          Basierend auf {formatNumberSmart(totalEntries)} Einträgen im Zeitraum {formattedDateRange}
        </p>
      )}
    </div>
  );
}

// Saved Reports List Component (inline)
// Only shows pattern_analysis reports, not diary_pdf reports
function SavedReportsList({ 
  onViewReport 
}: { 
  onViewReport: (report: AIReport) => void;
}) {
  const { data: allReports = [], isLoading } = useAIReports();
  const deleteReport = useDeleteAIReport();
  const [deleteTarget, setDeleteTarget] = useState<AIReport | null>(null);

  // Filter to only show pattern_analysis reports in this tab
  const reports = allReports.filter(r => r.report_type === 'pattern_analysis');

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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <Card className="p-6 text-center border-dashed">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h4 className="font-medium text-sm mb-1">Noch kein KI-Analysebericht erstellt</h4>
            <p className="text-xs text-muted-foreground">
              Starte oben deine erste Analyse – sie wird hier gespeichert.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {reports.map((report) => (
          <Card
            key={report.id}
            className="p-3 hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => onViewReport(report)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                  <h4 className="font-medium text-sm truncate">{report.title}</h4>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {report.from_date && report.to_date 
                      ? `${format(new Date(report.from_date), "d. MMM", { locale: de })} – ${format(new Date(report.to_date), "d. MMM yyyy", { locale: de })}`
                      : "Kein Zeitraum"
                    }
                  </span>
                </div>
                
                <p className="text-xs text-muted-foreground mt-0.5">
                  Erstellt: {format(new Date(report.created_at), "d. MMM yyyy, HH:mm", { locale: de })}
                </p>
              </div>
              
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewReport(report);
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(report);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
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
    </>
  );
}

interface VoiceNotesAIAnalysisProps {
  onViewReport?: (report: AIReport) => void;
}

export function VoiceNotesAIAnalysis({ onViewReport }: VoiceNotesAIAnalysisProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<AnalysisErrorState | null>(null);
  const [dateRange, setDateRange] = useState<{from: Date, to: Date}>({
    from: subMonths(new Date(), 3),
    to: new Date()
  });
  const [isLoadingFirstEntry, setIsLoadingFirstEntry] = useState(false);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<Date | null>(null);
  const [buttonCooldown, setButtonCooldown] = useState(0);

  // Client-side button cooldown timer
  React.useEffect(() => {
    if (buttonCooldown > 0) {
      const timer = setTimeout(() => setButtonCooldown(prev => Math.max(0, prev - 1)), 1000);
      return () => clearTimeout(timer);
    }
  }, [buttonCooldown]);

  // Get quota display info
  const quotaInfo = analysisResult?.quota || analysisError?.quota;

  const loadFirstEntryDate = async () => {
    setIsLoadingFirstEntry(true);
    try {
      const { data: oldestEntry } = await supabase
        .from('pain_entries')
        .select('timestamp_created, selected_date')
        .order('timestamp_created', { ascending: true })
        .limit(1)
        .single();

      const { data: oldestVoiceNote } = await supabase
        .from('voice_notes')
        .select('occurred_at')
        .order('occurred_at', { ascending: true })
        .limit(1)
        .single();

      let earliestDate = new Date();
      
      if (oldestEntry) {
        const entryDate = new Date(oldestEntry.selected_date || oldestEntry.timestamp_created);
        if (entryDate < earliestDate) earliestDate = entryDate;
      }

      if (oldestVoiceNote) {
        const voiceNoteDate = new Date(oldestVoiceNote.occurred_at);
        if (voiceNoteDate < earliestDate) earliestDate = voiceNoteDate;
      }

      setDateRange({ from: earliestDate, to: new Date() });
    } catch (error) {
      logError('VoiceNotesAIAnalysis.loadFirstEntryDate', error);
      // Silently fail - user can still manually select dates
    } finally {
      setIsLoadingFirstEntry(false);
    }
  };

  /**
   * Handles all error scenarios and sets user-friendly error state.
   * Technical details are logged but never shown to users.
   */
  const handleAnalysisError = (error: unknown, requestId?: string, errorData?: any) => {
    // Log technical details internally for debugging
    logError('VoiceNotesAIAnalysis.runAnalysis', error);
    
    let internalRequestId = requestId;
    let internalError = 'Unknown error';
    
    if (error instanceof Error) {
      internalError = error.message;
    }
    
    // Set error state with quota/cooldown info if available
    setAnalysisError({
      hasError: true,
      errorCode: errorData?.errorCode || 'GENERIC',
      cooldownRemaining: errorData?.cooldownRemaining,
      quota: errorData?.quota,
      _internalRequestId: internalRequestId,
      _internalError: internalError,
    });
  };

  const runAnalysis = async () => {
    // Clear previous error and results when starting new analysis
    setAnalysisError(null);
    
    const daysDiff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
    
    // User input validation - these are user errors, not system errors
    if (daysDiff > 730) {
      setAnalysisError({ hasError: true, _internalError: 'Time range too large' });
      return;
    }

    if (dateRange.from > new Date()) {
      setAnalysisError({ hasError: true, _internalError: 'Start date in future' });
      return;
    }

    setIsAnalyzing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-voice-notes', {
        body: {
          fromDate: dateRange.from.toISOString(),
          toDate: dateRange.to.toISOString()
        }
      });

      // Handle Supabase function invocation errors (network, 500, etc.)
      if (error) {
        let requestId: string | undefined;
        
        // Try to extract request ID for internal logging only
        if (error.context?.body) {
          try {
            const bodyText = await error.context.body.text();
            const parsed = JSON.parse(bodyText);
            requestId = parsed.requestId;
          } catch { 
            // Ignore parse errors - just for logging
          }
        }
        
        handleAnalysisError(error, requestId);
        return;
      }

      // Handle API-level errors returned in response body
      if (data?.error) {
        handleAnalysisError(new Error(data.error), data.requestId, data);
        return;
      }

      // Success! Clear any error state and show results
      setAnalysisError(null);
      setAnalysisResult(data);
      setLastAnalysisTime(new Date());
      // Set client-side button cooldown (5 seconds after success)
      setButtonCooldown(5);
      
    } catch (error) {
      // Catch-all for unexpected errors (network timeout, JSON parse, etc.)
      handleAnalysisError(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRetry = () => {
    runAnalysis();
  };

  // Format the currently selected date range for display
  const formattedCurrentRange = formatDateRangeDE(dateRange.from, dateRange.to);

  // Check if quota is exhausted
  const isQuotaExhausted = quotaInfo && !quotaInfo.isUnlimited && quotaInfo.remaining <= 0;

  return (
    <div className="space-y-6">
      {/* INFO BLOCK - short and concise */}
      <Alert className="border-primary/20 bg-primary/5">
        <Brain className="h-4 w-4" />
        <AlertDescription>
          <p className="text-sm text-muted-foreground">
            Erstellt einen gespeicherten Bericht aus deinen Einträgen, Notizen, Wetter- und Medikamentendaten.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Private Auswertung · keine medizinische Beratung</p>
        </AlertDescription>
      </Alert>

      {/* MAIN ACTION CARD */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              <span>Analyse starten</span>
            </div>
            <PremiumBadge label="Premium · Testphase" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Range Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Zeitraum</Label>
              <span className="text-sm text-muted-foreground">{formattedCurrentRange}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Von</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateRange.from && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formatDateDE(dateRange.from)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.from}
                      onSelect={(d) => d && setDateRange(prev => ({ ...prev, from: d }))}
                      locale={de}
                      disabled={(date) => date > dateRange.to}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Bis</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateRange.to && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formatDateDE(dateRange.to)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.to}
                      onSelect={(d) => d && setDateRange(prev => ({ ...prev, to: d }))}
                      locale={de}
                      disabled={(date) => date < dateRange.from || date > new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Quick Select Buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setDateRange({ from: subMonths(new Date(), 1), to: new Date() })}>
                Letzter Monat
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDateRange({ from: subMonths(new Date(), 3), to: new Date() })}>
                3 Monate
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDateRange({ from: subMonths(new Date(), 12), to: new Date() })}>
                1 Jahr
              </Button>
              <Button size="sm" variant="outline" onClick={loadFirstEntryDate} disabled={isLoadingFirstEntry}>
                {isLoadingFirstEntry ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Lade...</> : 'Alle Daten'}
              </Button>
            </div>
          </div>

          {/* User-friendly Error Display */}
          {analysisError?.hasError && (
            <Card className="border-muted bg-muted/30">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Info className="h-6 w-6 text-muted-foreground" />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="font-medium text-foreground">
                      {analysisError.errorCode === 'COOLDOWN' 
                        ? 'Bitte kurz warten'
                        : analysisError.errorCode === 'QUOTA_EXCEEDED'
                        ? 'Monatliches Limit erreicht'
                        : 'KI-Analyse aktuell nicht verfügbar'}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {analysisError.errorCode === 'COOLDOWN' 
                        ? `Bitte warte noch ${analysisError.cooldownRemaining || 60} Sekunden, bevor du erneut analysierst.`
                        : analysisError.errorCode === 'QUOTA_EXCEEDED'
                        ? 'Du hast dein monatliches Analyselimit erreicht. Nächsten Monat stehen dir wieder Analysen zur Verfügung.'
                        : 'Die Analyse konnte im Moment leider nicht durchgeführt werden. Bitte versuche es später erneut.'}
                    </p>
                    {analysisError.quota && !analysisError.quota.isUnlimited && (
                      <p className="text-xs text-muted-foreground/70">
                        Nutzung: {analysisError.quota.used}/{analysisError.quota.limit} Analysen diesen Monat
                      </p>
                    )}
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    {analysisError.errorCode !== 'QUOTA_EXCEEDED' && (
                      <Button 
                        onClick={handleRetry} 
                        variant="default"
                        size="sm"
                        disabled={isAnalyzing || (analysisError.errorCode === 'COOLDOWN' && (analysisError.cooldownRemaining || 0) > 0)}
                      >
                        {isAnalyzing ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyse läuft …</>
                        ) : (
                          <><RefreshCw className="h-4 w-4 mr-2" /> Erneut versuchen</>
                        )}
                      </Button>
                    )}
                    <Button 
                      onClick={() => setAnalysisError(null)} 
                      variant="ghost"
                      size="sm"
                    >
                      Schließen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quota Display - robust: only show numbers if quotaInfo is available */}
          {!analysisError?.hasError && (
            <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              {quotaInfo && !quotaInfo.isUnlimited ? (
                <>
                  <span>Nutzung:</span>
                  <Badge variant={quotaInfo.remaining <= 1 ? "destructive" : "secondary"}>
                    {quotaInfo.used}/{quotaInfo.limit}
                  </Badge>
                </>
              ) : quotaInfo?.isUnlimited ? (
                <span className="w-full text-center">Unbegrenzt verfügbar</span>
              ) : (
                <span className="w-full text-center text-xs">Testphase: bis zu 10 Berichte pro Monat.</span>
              )}
            </div>
          )}

          {/* Analysis Button - only show if no error is displayed */}
          {!analysisError?.hasError && (
            <div className="space-y-2">
              <Button 
                onClick={runAnalysis} 
                disabled={isAnalyzing || buttonCooldown > 0 || isQuotaExhausted} 
                className="w-full" 
                size="lg"
              >
                {isAnalyzing ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyse läuft …</>
                ) : buttonCooldown > 0 ? (
                  <><Clock className="h-4 w-4 mr-2" /> Warte {buttonCooldown}s …</>
                ) : isQuotaExhausted ? (
                  <>Limit erreicht</>
                ) : (
                  <><Brain className="h-4 w-4 mr-2" /> Analyse starten</>
                )}
              </Button>
              {isQuotaExhausted && (
                <p className="text-xs text-muted-foreground text-center">
                  Limit erreicht – verfügbar ab nächstem Monat.
                </p>
              )}
            </div>
          )}

          {/* AI availability hint */}
          {analysisResult?.ai_available === false && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                KI-Text war nicht verfügbar. Ergebnisse basieren auf statistischer Auswertung.
              </AlertDescription>
            </Alert>
          )}

          {/* Results Display */}
          {analysisResult?.structured && lastAnalysisTime && (
            <StructuredResultsDisplay 
              data={analysisResult.structured} 
              dateRange={dateRange}
              lastUpdated={lastAnalysisTime}
            />
          )}

          {/* Legacy fallback for old string responses */}
          {analysisResult?.insights && !analysisResult?.structured && (
            <div className="mt-6 prose prose-sm max-w-none dark:prose-invert">
              <div className="bg-muted/50 p-6 rounded-lg border whitespace-pre-wrap">
                {analysisResult.insights}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!analysisResult && !isAnalyzing && !analysisError && (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Wähle einen Zeitraum und starte die Analyse</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SAVED REPORTS SECTION */}
      <div className="space-y-3">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Deine KI-Analyseberichte
        </h3>
        <SavedReportsList onViewReport={(report) => onViewReport?.(report)} />
      </div>
    </div>
  );
}
