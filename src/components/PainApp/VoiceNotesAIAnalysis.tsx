import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Brain, Loader2, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { format, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AnalysisResult {
  requestId?: string;
  insights: string;
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
    tags_by_category: Array<{ category: string; count: number }>;
  };
}

interface AnalysisError {
  requestId?: string;
  error: string;
  details?: string[];
}

export function VoiceNotesAIAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
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
      // Get oldest pain entry
      const { data: oldestEntry } = await supabase
        .from('pain_entries')
        .select('timestamp_created, selected_date')
        .order('timestamp_created', { ascending: true })
        .limit(1)
        .single();

      // Get oldest voice note
      const { data: oldestVoiceNote } = await supabase
        .from('voice_notes')
        .select('occurred_at')
        .order('occurred_at', { ascending: true })
        .limit(1)
        .single();

      // Determine the earliest date
      let earliestDate = new Date();
      
      if (oldestEntry) {
        const entryDate = new Date(oldestEntry.selected_date || oldestEntry.timestamp_created);
        if (entryDate < earliestDate) {
          earliestDate = entryDate;
        }
      }

      if (oldestVoiceNote) {
        const voiceNoteDate = new Date(oldestVoiceNote.occurred_at);
        if (voiceNoteDate < earliestDate) {
          earliestDate = voiceNoteDate;
        }
      }

      // Set date range from earliest to today
      setDateRange({
        from: earliestDate,
        to: new Date()
      });
    } catch (error) {
      console.error('Error loading first entry date:', error);
      toast({
        title: 'Hinweis',
        description: 'Konnte erstes Eintragsdatum nicht laden, verwende Standardzeitraum',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingFirstEntry(false);
    }
  };

  const runAnalysis = async () => {
    // Clear previous error
    setAnalysisError(null);
    
    // Validate date range before sending
    const daysDiff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 730) {
      toast({
        title: 'Zeitraum zu groß',
        description: 'Bitte wählen Sie einen Zeitraum von maximal 2 Jahren (730 Tage)',
        variant: 'destructive'
      });
      return;
    }

    if (dateRange.from > new Date()) {
      toast({
        title: 'Ungültiges Datum',
        description: 'Das Start-Datum darf nicht in der Zukunft liegen',
        variant: 'destructive'
      });
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
        // Try to extract error details from the response
        let errorData: AnalysisError = { error: error.message || 'Unbekannter Fehler' };
        
        // Check if error has context with response body
        if (error.context?.body) {
          try {
            const bodyText = await error.context.body.text();
            const parsed = JSON.parse(bodyText);
            errorData = {
              requestId: parsed.requestId,
              error: parsed.error || error.message,
              details: parsed.details
            };
          } catch {
            // Ignore parse errors
          }
        }
        
        setAnalysisError(errorData);
        toast({
          title: 'Analyse fehlgeschlagen',
          description: errorData.error,
          variant: 'destructive'
        });
        return;
      }

      // Check if response contains an error
      if (data.error) {
        setAnalysisError({
          requestId: data.requestId,
          error: data.error,
          details: data.details
        });
        toast({
          title: 'Analyse fehlgeschlagen',
          description: data.error,
          variant: 'destructive'
        });
        return;
      }

      setInsights(data.insights);
      setAnalysisResult(data);
      
      const parts = [];
      if (data.analyzed_entries > 0) parts.push(`${data.analyzed_entries} Einträge`);
      if (data.voice_notes_count > 0) parts.push(`${data.voice_notes_count} Notizen`);
      
      toast({
        title: 'Analyse abgeschlossen',
        description: `${parts.join(' + ')} analysiert${data.has_weather_data ? ' (inkl. Wetter)' : ''}${data.ai_available === false ? ' (ohne KI)' : ''}`
      });
    } catch (error) {
      console.error('AI Analysis Error:', error);
      
      const errorMsg = error instanceof Error ? error.message : 'Analyse fehlgeschlagen';
      setAnalysisError({ error: errorMsg });
      
      toast({
        title: 'Fehler',
        description: errorMsg,
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Brain className="h-4 w-4" />
        <AlertDescription>
          Die KI-Musteranalyse wertet alle Ihre Tracker-Daten aus:
          <ul className="list-disc ml-4 mt-2 space-y-1">
            <li>Kopfschmerz-Einträge mit Notizen</li>
            <li>Potentielle Trigger und Faktoren (Stimmung, Schlaf, Stress, etc.)</li>
            <li>Wetterdaten & Medikamenten-Wirkung</li>
            <li>Prophylaxe-Verläufe (Before/After)</li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Private Nutzung – keine medizinische Beratung. DSGVO-konform.</p>
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
            <Label>Zeitraum für Analyse</Label>
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
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setDateRange({
                  from: subMonths(new Date(), 1),
                  to: new Date()
                })}
              >
                Letzter Monat
              </Button>
              
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setDateRange({
                  from: subMonths(new Date(), 3),
                  to: new Date()
                })}
              >
                Letzte 3 Monate
              </Button>
              
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setDateRange({
                  from: subMonths(new Date(), 12),
                  to: new Date()
                })}
              >
                Letztes Jahr
              </Button>
              
              <Button 
                size="sm" 
                variant="outline" 
                onClick={loadFirstEntryDate}
                disabled={isLoadingFirstEntry}
              >
                {isLoadingFirstEntry ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Lade...
                  </>
                ) : (
                  'Alle Daten'
                )}
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
          <Button
            onClick={runAnalysis}
            disabled={isAnalyzing}
            className="w-full flex items-center gap-2"
            size="lg"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysiere Muster...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4" />
                Muster-Analyse starten
              </>
            )}
          </Button>

          {/* Statistics Cards */}
          {analysisResult && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <Card className="p-3">
                  <div className="text-2xl font-bold">{analysisResult.total_analyzed}</div>
                  <div className="text-xs text-muted-foreground">Gesamt</div>
                </Card>
                <Card className="p-3">
                  <div className="text-2xl font-bold">{analysisResult.analyzed_entries}</div>
                  <div className="text-xs text-muted-foreground">Einträge</div>
                </Card>
                <Card className="p-3">
                  <div className="text-2xl font-bold">{analysisResult.voice_notes_count}</div>
                  <div className="text-xs text-muted-foreground">Notizen</div>
                </Card>
                <Card className="p-3">
                  <div className="text-2xl font-bold">{analysisResult.has_weather_data ? '✅' : '⚠️'}</div>
                  <div className="text-xs text-muted-foreground">Wetter</div>
                </Card>
              </div>

              {/* AI availability hint */}
              {analysisResult.ai_available === false && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    KI-Text war nicht verfügbar – die Analyse basiert auf statistischer Auswertung.
                  </AlertDescription>
                </Alert>
              )}

              {/* Tag Statistics */}
              {analysisResult.tags && analysisResult.tags.total_tags > 0 && (
                <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">Erkannte Muster aus Notizen</h3>
                      <Badge variant="outline" className="text-xs">
                        {analysisResult.tags.total_tags} Faktoren
                      </Badge>
                    </div>
                    
                    {analysisResult.tags.top_tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {analysisResult.tags.top_tags.slice(0, 8).map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {tag.label} ({tag.count}x)
                          </Badge>
                        ))}
                      </div>
                    )}

                    {analysisResult.tags.top_hashtags.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground mb-2">Hashtags:</p>
                        <div className="flex flex-wrap gap-1">
                          {analysisResult.tags.top_hashtags.slice(0, 6).map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {tag.tag} ({tag.count}x)
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </>
          )}

          {insights && (
            <div className="mt-6 prose prose-sm max-w-none dark:prose-invert">
              <div className="bg-muted/50 p-6 rounded-lg border">
                <ReactMarkdown>{insights}</ReactMarkdown>
              </div>
            </div>
          )}

          {!insights && !isAnalyzing && !analysisError && (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Klicken Sie auf "Muster-Analyse starten" für eine KI-gestützte Auswertung</p>
              <p className="text-sm mt-2">Die Analyse erkennt Muster, Trigger und Zusammenhänge aus Ihren Kopfschmerz-Daten.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
