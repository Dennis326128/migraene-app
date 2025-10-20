import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Brain, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';

export function VoiceNotesAIAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insights, setInsights] = useState<string | null>(null);
  const [analyzedCount, setAnalyzedCount] = useState<number>(0);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

      const { data, error } = await supabase.functions.invoke('analyze-voice-notes', {
        body: {
          fromDate: from.toISOString(),
          toDate: now.toISOString()
        }
      });

      if (error) throw error;

      setInsights(data.insights);
      setAnalyzedCount(data.analyzed_notes);
      
      toast({
        title: '✅ Analyse abgeschlossen',
        description: `${data.analyzed_notes} Voice-Notizen analysiert`
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
          KI-Analyse wertet Ihre Voice-Notizen aus und erkennt Muster, Trigger und Zusammenhänge.
          <strong> Anonymisiert & DSGVO-konform.</strong>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Voice-Notizen KI-Analyse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-center">
            <Button
              onClick={runAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysiere...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4" />
                  Analyse starten (letzte 30 Tage)
                </>
              )}
            </Button>
            {analyzedCount > 0 && (
              <span className="text-sm text-muted-foreground">
                {analyzedCount} Notizen analysiert
              </span>
            )}
          </div>

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
              <p>Klicken Sie auf "Analyse starten" für eine KI-gestützte Auswertung Ihrer Voice-Notizen</p>
              <p className="text-sm mt-2">Die Analyse erkennt Muster, Trigger und gibt Empfehlungen für Ihr Arztgespräch.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
