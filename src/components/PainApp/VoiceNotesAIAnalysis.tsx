import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Brain, Loader2, Calendar as CalendarIcon, RefreshCw, ChevronDown, ChevronRight, Activity, Cloud, Pill, Database, Clock, Tag, Info, FileText, TrendingUp, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { logError } from '@/lib/utils/errorMessages';
import { formatDateRangeDE, formatDateDE, formatNumberSmart, formatLastUpdated } from '@/lib/formatters';

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

export function VoiceNotesAIAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<AnalysisErrorState | null>(null);
  const [dateRange, setDateRange] = useState<{from: Date, to: Date}>({
    from: subMonths(new Date(), 3),
    to: new Date()
  });
  const [isLoadingFirstEntry, setIsLoadingFirstEntry] = useState(false);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<Date | null>(null);

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
  const handleAnalysisError = (error: unknown, requestId?: string) => {
    // Log technical details internally for debugging
    logError('VoiceNotesAIAnalysis.runAnalysis', error);
    
    // Extract request ID if available for internal tracking
    let internalRequestId = requestId;
    let internalError = 'Unknown error';
    
    if (error instanceof Error) {
      internalError = error.message;
    }
    
    // Set simple error state - NO technical details exposed
    setAnalysisError({
      hasError: true,
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
        handleAnalysisError(new Error(data.error), data.requestId);
        return;
      }

      // Success! Clear any error state and show results
      setAnalysisError(null);
      setAnalysisResult(data);
      setLastAnalysisTime(new Date());
      
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

  return (
    <div className="space-y-4">
      <Alert>
        <Brain className="h-4 w-4" />
        <AlertDescription>
          Die KI-Musteranalyse wertet alle Tracker-Daten aus: Kopfschmerz-Einträge, Notizen, Wetter, Medikamente und Prophylaxe-Verläufe.
          <p className="mt-2 text-xs text-muted-foreground">Private Auswertung. Keine medizinische Beratung.</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            KI-Musteranalyse
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
                      KI-Analyse aktuell nicht verfügbar
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Die Analyse konnte im Moment leider nicht durchgeführt werden.
                      Bitte versuche es später erneut.
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Deine Daten sind sicher gespeichert.
                    </p>
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <Button 
                      onClick={handleRetry} 
                      variant="default"
                      size="sm"
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyse läuft …</>
                      ) : (
                        <><RefreshCw className="h-4 w-4 mr-2" /> Erneut versuchen</>
                      )}
                    </Button>
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

          {/* Analysis Button - only show if no error is displayed */}
          {!analysisError?.hasError && (
            <Button onClick={runAnalysis} disabled={isAnalyzing} className="w-full" size="lg">
              {isAnalyzing ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyse läuft …</>
              ) : (
                <><Brain className="h-4 w-4 mr-2" /> Analyse starten</>
              )}
            </Button>
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
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Klicke auf „Analyse starten" für eine Musterauswertung</p>
              <p className="text-sm mt-2">Die Analyse erkennt Muster, Trigger und Zusammenhänge.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
