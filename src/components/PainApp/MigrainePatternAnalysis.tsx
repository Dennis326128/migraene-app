/**
 * MigrainePatternAnalysis.tsx
 * 
 * Clean, migraine-focused display of the voice pattern analysis engine results.
 * Lives under "Auswertung & Statistiken → KI-Analyse".
 * 
 * Design principles:
 * - Focus on migraine correlations, not day-by-day logs
 * - No redundant sections
 * - Calm, readable, non-technical
 * - No debug info leaks
 * - Sparse, user-friendly dates (e.g. "10. Apr.")
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Brain, Loader2, AlertCircle, Lightbulb, RefreshCw, HelpCircle, TrendingUp, Search } from 'lucide-react';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { TimeRangeSelector } from './TimeRangeSelector';
import { runVoicePatternAnalysis } from '@/lib/voice/analysisEngine';
import { isAnalysisUnavailable, type VoiceAnalysisResult, type PatternFinding, type ContextFinding } from '@/lib/voice/analysisTypes';
import { logError } from '@/lib/utils/errorMessages';

// ============================================================
// === EVIDENCE BADGE ===
// ============================================================

const evidenceLabels: Record<string, string> = {
  low: 'Wenige Hinweise',
  medium: 'Mehrere Hinweise',
  high: 'Deutliche Hinweise',
};

const evidenceStyles: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
};

function EvidenceBadge({ strength }: { strength: string }) {
  return (
    <Badge variant="outline" className={`text-xs ${evidenceStyles[strength] || ''}`}>
      {evidenceLabels[strength] || strength}
    </Badge>
  );
}

// ============================================================
// === PATTERN CARD ===
// ============================================================

function PatternCard({ pattern }: { pattern: PatternFinding }) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="font-medium text-sm leading-snug">{pattern.title}</h4>
        <EvidenceBadge strength={pattern.evidenceStrength} />
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{pattern.description}</p>
      {pattern.uncertaintyNotes.length > 0 && (
        <p className="text-xs text-muted-foreground/70 mt-2 italic">
          {pattern.uncertaintyNotes[0].reason}
        </p>
      )}
    </div>
  );
}

// ============================================================
// === CONTEXT FINDING ITEM ===
// ============================================================

function ContextItem({ finding }: { finding: ContextFinding }) {
  return (
    <li className="text-sm text-foreground flex items-start gap-2">
      <span className="text-muted-foreground mt-1 shrink-0">•</span>
      <span>{finding.observation}</span>
    </li>
  );
}

// ============================================================
// === RESULTS DISPLAY ===
// ============================================================

function AnalysisResults({ result }: { result: VoiceAnalysisResult }) {
  // Merge all context findings, prioritizing pain-related
  const painFindings = result.painContextFindings;
  const fatigueFindings = result.fatigueContextFindings.filter(f => 
    // Only show fatigue findings that relate to headache context
    f.observation.toLowerCase().includes('schmerz') ||
    f.observation.toLowerCase().includes('kopf') ||
    f.observation.toLowerCase().includes('migräne') ||
    f.observation.toLowerCase().includes('belastung') ||
    f.observation.toLowerCase().includes('erschöpf') ||
    // Always show if evidence is medium+
    f.evidenceStrength !== 'low'
  );
  const medFindings = result.medicationContextFindings;
  const allContextFindings = [...painFindings, ...fatigueFindings, ...medFindings];

  // Deduplicate patterns - remove patterns whose title/description closely match context findings
  const patterns = result.possiblePatterns;

  const hasPatterns = patterns.length > 0;
  const hasContext = allContextFindings.length > 0;
  const hasSequences = result.recurringSequences.length > 0;
  const hasOpenQuestions = result.openQuestions.length > 0;
  const hasConfidenceNotes = result.confidenceNotes.length > 0;

  return (
    <div className="space-y-5">
      {/* 1. Summary */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-sm leading-relaxed">{result.summary}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Basierend auf {result.scope.daysAnalyzed} analysierten Tagen
            {result.scope.voiceEventCount > 0 && ` · ${result.scope.voiceEventCount} Sprachnotizen`}
            {result.scope.painEntryCount > 0 && ` · ${result.scope.painEntryCount} Schmerzeinträge`}
          </p>
        </CardContent>
      </Card>

      {/* 2. Possible patterns / trigger candidates */}
      {hasPatterns && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Mögliche Einflussfaktoren</h3>
          </div>
          <div className="space-y-2">
            {patterns.map((p, i) => (
              <PatternCard key={i} pattern={p} />
            ))}
          </div>
        </div>
      )}

      {/* 3. Recurring sequences */}
      {hasSequences && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Wiederkehrende Muster</h3>
          </div>
          <div className="space-y-2">
            {result.recurringSequences.map((seq, i) => (
              <div key={i} className="p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{seq.pattern}</span>
                  {seq.count > 1 && (
                    <Badge variant="secondary" className="text-xs">
                      {seq.count}×
                    </Badge>
                  )}
                </div>
                {seq.llmInterpretation && (
                  <p className="text-sm text-muted-foreground">{seq.llmInterpretation}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Context findings (merged, no redundancy) */}
      {hasContext && !hasPatterns && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Beobachtete Kontexte</h3>
          </div>
          <ul className="space-y-2">
            {allContextFindings.slice(0, 8).map((f, i) => (
              <ContextItem key={i} finding={f} />
            ))}
          </ul>
        </div>
      )}

      {/* 5. Open questions & uncertainty */}
      {(hasOpenQuestions || hasConfidenceNotes) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-muted-foreground">Was noch unklar ist</h3>
          </div>
          <ul className="space-y-1.5">
            {result.openQuestions.map((q, i) => (
              <li key={`q-${i}`} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="mt-1 shrink-0">•</span>
                <span>{q}</span>
              </li>
            ))}
            {result.confidenceNotes.map((n, i) => (
              <li key={`c-${i}`} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="mt-1 shrink-0">•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground/60 text-center pt-2 border-t border-border/50">
        Mögliche Zusammenhänge · keine medizinische Diagnose · Muster können zufällig sein
      </p>
    </div>
  );
}

// ============================================================
// === MAIN COMPONENT ===
// ============================================================

export function MigrainePatternAnalysis() {
  const { from, to } = useTimeRange();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<VoiceAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    setError(null);
    setIsAnalyzing(true);

    try {
      const range = {
        from: new Date(from + 'T00:00:00'),
        to: new Date(to + 'T23:59:59'),
      };

      const analysisResult = await runVoicePatternAnalysis(range);

      if (isAnalysisUnavailable(analysisResult)) {
        setError('Zu wenig Daten für eine aussagekräftige Analyse. Dokumentiere weiter und versuche es später erneut.');
        setResult(null);
      } else {
        setResult(analysisResult);
      }
    } catch (err) {
      logError('MigrainePatternAnalysis.run', err);
      const msg = err instanceof Error ? err.message : 'Analyse fehlgeschlagen';
      // User-friendly error messages
      if (msg.includes('Rate Limit')) {
        setError('Bitte warte einen Moment, bevor du erneut analysierst.');
      } else if (msg.includes('Guthaben')) {
        setError('Monatliches Analyselimit erreicht. Nächsten Monat stehen dir wieder Analysen zur Verfügung.');
      } else if (msg.includes('Keine Daten')) {
        setError('Im gewählten Zeitraum sind keine Daten vorhanden. Bitte wähle einen anderen Zeitraum.');
      } else {
        setError('Die Analyse konnte im Moment nicht durchgeführt werden. Bitte versuche es später erneut.');
      }
      setResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, [from, to]);

  return (
    <div className="space-y-5">
      {/* Info */}
      <Alert className="border-primary/20 bg-primary/5">
        <Brain className="h-4 w-4" />
        <AlertDescription>
          <p className="text-sm text-muted-foreground">
            Analysiert deine Einträge und Sprachnotizen auf mögliche Zusammenhänge mit Migräne.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Keine medizinische Diagnose · Ergebnisse sind Hinweise, keine Gewissheit
          </p>
        </AlertDescription>
      </Alert>

      {/* Controls */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <TimeRangeSelector />
          
          <Button
            onClick={runAnalysis}
            disabled={isAnalyzing}
            className="w-full"
            size="lg"
          >
            {isAnalyzing ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyse läuft …</>
            ) : result ? (
              <><RefreshCw className="h-4 w-4 mr-2" /> Erneut analysieren</>
            ) : (
              <><Brain className="h-4 w-4 mr-2" /> Muster analysieren</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-muted">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button
                  onClick={runAnalysis}
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  disabled={isAnalyzing}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Erneut versuchen
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && <AnalysisResults result={result} />}

      {/* Empty state */}
      {!result && !isAnalyzing && !error && (
        <div className="text-center py-10 text-muted-foreground">
          <Brain className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Wähle einen Zeitraum und starte die Analyse</p>
          <p className="text-xs mt-1 opacity-70">
            Die KI sucht nach möglichen Mustern und Einflussfaktoren
          </p>
        </div>
      )}
    </div>
  );
}
