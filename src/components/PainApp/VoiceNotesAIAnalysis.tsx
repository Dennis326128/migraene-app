import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Brain, Loader2, Calendar as CalendarIcon, AlertTriangle, ChevronDown, ChevronRight, Activity, Cloud, Pill, Database, Clock, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

interface AnalysisError {
  requestId?: string;
  error: string;
  details?: string[];
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
          {t.tag} ({t.count}x)
        </Badge>
      ))}
    </div>
  );
}

// Structured Results Display
function StructuredResultsDisplay({ data }: { data: StructuredAnalysis }) {
  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <h3 className="font-semibold mb-2">{data.overview.headline}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="text-center">
              <div className="text-2xl font-bold">{data.dataCoverage.entries}</div>
              <div className="text-xs text-muted-foreground">Einträge</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{data.dataCoverage.notes}</div>
              <div className="text-xs text-muted-foreground">Notizen</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{data.dataCoverage.weatherDays}</div>
              <div className="text-xs text-muted-foreground">Wetter-Tage</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{data.dataCoverage.prophylaxisCourses}</div>
              <div className="text-xs text-muted-foreground">Prophylaxen</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Zeitraum: {data.timeRange.from} bis {data.timeRange.to}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{data.overview.disclaimer}</p>
        </CardContent>
      </Card>

      {/* Key Findings */}
      {data.keyFindings && data.keyFindings.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-sm">Wichtigste Erkenntnisse</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.keyFindings.map((finding, idx) => (
              <KeyFindingCard key={idx} finding={finding} />
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {data.sections && data.sections.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Detailanalyse</h3>
          {data.sections.map((section, idx) => (
            <AnalysisSection key={idx} section={section} />
          ))}
        </div>
      )}

      {/* Tags from Notes */}
      {data.tagsFromNotes && data.tagsFromNotes.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-sm">Erkannte Kontext-Faktoren</h3>
          <TagsDisplay tags={data.tagsFromNotes} />
        </div>
      )}
    </div>
  );
}

export function VoiceNotesAIAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<AnalysisError | null>(null);
  const [dateRange, setDateRange] = useState<{from: Date, to: Date}>({
    from: subMonths(new Date(), 3),
    to: new Date()
  });
  const [isLoadingFirstEntry, setIsLoadingFirstEntry] = useState(false);

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
      console.error('Error loading first entry date:', error);
      toast({
        title: 'Hinweis',
        description: 'Konnte erstes Eintragsdatum nicht laden',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingFirstEntry(false);
    }
  };

  const runAnalysis = async () => {
    setAnalysisError(null);
    
    const daysDiff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 730) {
      toast({ title: 'Zeitraum zu groß', description: 'Maximal 2 Jahre (730 Tage)', variant: 'destructive' });
      return;
    }

    if (dateRange.from > new Date()) {
      toast({ title: 'Ungültiges Datum', description: 'Start-Datum darf nicht in der Zukunft liegen', variant: 'destructive' });
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

      if (error) {
        let errorData: AnalysisError = { error: error.message || 'Unbekannter Fehler' };
        if (error.context?.body) {
          try {
            const bodyText = await error.context.body.text();
            const parsed = JSON.parse(bodyText);
            errorData = { requestId: parsed.requestId, error: parsed.error || error.message, details: parsed.details };
          } catch { /* ignore */ }
        }
        setAnalysisError(errorData);
        toast({ title: 'Analyse fehlgeschlagen', description: errorData.error, variant: 'destructive' });
        return;
      }

      if (data.error) {
        setAnalysisError({ requestId: data.requestId, error: data.error, details: data.details });
        toast({ title: 'Analyse fehlgeschlagen', description: data.error, variant: 'destructive' });
        return;
      }

      setAnalysisResult(data);
      
      const parts = [];
      if (data.analyzed_entries > 0) parts.push(`${data.analyzed_entries} Einträge`);
      if (data.voice_notes_count > 0) parts.push(`${data.voice_notes_count} Notizen`);
      
      toast({
        title: 'Analyse abgeschlossen',
        description: `${parts.join(' + ')} analysiert${data.ai_available === false ? ' (ohne KI)' : ''}`
      });
    } catch (error) {
      console.error('AI Analysis Error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Analyse fehlgeschlagen';
      setAnalysisError({ error: errorMsg });
      toast({ title: 'Fehler', description: errorMsg, variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

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
            <Label>Zeitraum</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Von</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateRange.from && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(dateRange.from, 'dd.MM.yyyy', { locale: de })}
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
                      {format(dateRange.to, 'dd.MM.yyyy', { locale: de })}
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

          {/* Error Display */}
          {analysisError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">{analysisError.error}</p>
                  {analysisError.details && (
                    <ul className="text-xs list-disc ml-4">
                      {analysisError.details.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  )}
                  {analysisError.requestId && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Request-ID: <code className="bg-muted px-1 rounded">{analysisError.requestId}</code>
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Analysis Button */}
          <Button onClick={runAnalysis} disabled={isAnalyzing} className="w-full" size="lg">
            {isAnalyzing ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analysiere...</>
            ) : (
              <><Brain className="h-4 w-4 mr-2" /> Analyse starten</>
            )}
          </Button>

          {/* AI availability hint */}
          {analysisResult?.ai_available === false && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                KI-Text war nicht verfügbar. Ergebnisse basieren auf statistischer Auswertung.
              </AlertDescription>
            </Alert>
          )}

          {/* Results Display */}
          {analysisResult?.structured && (
            <StructuredResultsDisplay data={analysisResult.structured} />
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
              <p>Klicken Sie auf "Analyse starten" für eine Musterauswertung</p>
              <p className="text-sm mt-2">Die Analyse erkennt Muster, Trigger und Zusammenhänge.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
