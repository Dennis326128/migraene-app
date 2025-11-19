import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Brain, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { format, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AnalysisResult {
  insights: string;
  analyzed_entries: number;
  voice_notes_count: number;
  total_analyzed: number;
  has_weather_data: boolean;
  date_range: { from: string; to: string };
  tags?: {
    total_tags: number;
    unique_tags: number;
    top_tags: Array<{ tag: string; label: string; count: number }>;
    top_hashtags: Array<{ tag: string; count: number }>;
    tags_by_category: Array<{ category: string; count: number }>;
  };
}

export function VoiceNotesAIAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [dateRange, setDateRange] = useState<{from: Date, to: Date}>({
    from: subMonths(new Date(), 3),
    to: new Date()
  });

  const runAnalysis = async () => {
    // Validate date range before sending
    const daysDiff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 730) {
      toast({
        title: '⚠️ Zeitraum zu groß',
        description: 'Bitte wählen Sie einen Zeitraum von maximal 2 Jahren (730 Tage)',
        variant: 'destructive'
      });
      return;
    }

    if (dateRange.from > new Date()) {
      toast({
        title: '⚠️ Ungültiges Datum',
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

      if (error) throw error;

      setInsights(data.insights);
      setAnalysisResult(data);
      
      const parts = [];
      if (data.analyzed_entries > 0) parts.push(`${data.analyzed_entries} Migräne-Einträge`);
      if (data.voice_notes_count > 0) parts.push(`${data.voice_notes_count} Voice-Notizen`);
      
      toast({
        title: '✅ Analyse abgeschlossen',
        description: `${parts.join(' + ')} analysiert${data.has_weather_data ? ' (inkl. Wetter-Daten)' : ''}`
      });
    } catch (error) {
      console.error('AI Analysis Error:', error);
      toast({
        title: '❌ Fehler',
        description: error instanceof Error ? error.message : 'Analyse fehlgeschlagen',
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
          Die KI-Analyse wertet alle Ihre Einträge aus:
          <ul className="list-disc ml-4 mt-2 space-y-1">
            <li>Schmerzeinträge mit Notizen</li>
            <li>Potentielle Faktoren und Auslöser (Stimmung, Schlaf, Stress, etc.)</li>
            <li>Wetterdaten & Medikamente</li>
          </ul>
          <p className="mt-2">So erkennt sie Muster, Trigger und Zusammenhänge zwischen Schlagwörtern und Schmerzeinträgen. Anonymisiert & DSGVO-konform.</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            KI-Analyse Tagebuch
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
                onClick={() => setDateRange({
                  from: new Date('2020-01-01'),
                  to: new Date()
                })}
              >
                Alle Daten
              </Button>
            </div>
          </div>

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
                Analysiere...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4" />
                Analyse starten
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

              {/* Tag Statistics */}
              {analysisResult.tags && analysisResult.tags.total_tags > 0 && (
                <Card className="p-4 bg-gradient-to-br from-purple-500/5 to-pink-500/5 border-purple-200/20">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm">Erkannte Muster aus Voice-Notizen</h3>
                      <Badge variant="outline" className="text-xs">
                        {analysisResult.tags.total_tags} Schlagwörter
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

          {!insights && !isAnalyzing && (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Klicken Sie auf "Analyse starten" für eine KI-gestützte Auswertung Ihrer Tagebucheinträge</p>
              <p className="text-sm mt-2">Die Analyse erkennt automatisch Muster, Schlagwörter und Zusammenhänge aus Ihren Notizen und gibt Empfehlungen für Ihr Arztgespräch.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
