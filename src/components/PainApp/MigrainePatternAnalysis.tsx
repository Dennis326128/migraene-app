/**
 * MigrainePatternAnalysis.tsx
 * 
 * Clean, migraine-focused display of the voice pattern analysis engine results.
 * Lives under "Auswertung & Statistiken → KI-Analyse".
 * 
 * Design principles:
 * - Focus on migraine correlations, not day-by-day logs
 * - No redundant sections — each section has a unique function
 * - Calm, readable, non-technical
 * - No debug info leaks
 * - Sparse, user-friendly dates (e.g. "10. Apr.")
 * - Patterns sorted by relevance (evidence strength + occurrences)
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Brain, Loader2, AlertCircle, Lightbulb, RefreshCw, HelpCircle, TrendingUp, FileText, Eye, CheckCircle2 } from 'lucide-react';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { TimeRangeSelector } from './TimeRangeSelector';
import { runVoicePatternAnalysis } from '@/lib/voice/analysisEngine';
import { isAnalysisUnavailable, type VoiceAnalysisResult, type PatternFinding, type ContextFinding } from '@/lib/voice/analysisTypes';
import { selectAnalysisForChannel, saveAnalysisResult, canReanalyze, loadCachedAnalysis } from '@/lib/voice/analysisCache';
import { logError } from '@/lib/utils/errorMessages';

// ============================================================
// === HELPERS ===
// ============================================================

/** Evidence strength to sort priority (higher = more relevant) */
const EVIDENCE_PRIORITY: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** Sort patterns: higher evidence first, then by occurrence count */
function sortPatterns(patterns: PatternFinding[]): PatternFinding[] {
  return [...patterns].sort((a, b) => {
    const ePri = (EVIDENCE_PRIORITY[b.evidenceStrength] || 0) - (EVIDENCE_PRIORITY[a.evidenceStrength] || 0);
    if (ePri !== 0) return ePri;
    return b.occurrences - a.occurrences;
  });
}

/** Deduplicate: remove context findings whose observation text closely matches a pattern title or description */
function deduplicateFindings(
  findings: ContextFinding[],
  patterns: PatternFinding[],
): ContextFinding[] {
  if (patterns.length === 0) return findings;
  const patternTexts = patterns.map(p => (p.title + ' ' + p.description).toLowerCase());

  return findings.filter(f => {
    const obsLower = f.observation.toLowerCase();
    // If >60% of words in the observation appear in any pattern text → duplicate
    const words = obsLower.split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return true;
    return !patternTexts.some(pt => {
      const matchCount = words.filter(w => pt.includes(w)).length;
      return matchCount / words.length > 0.6;
    });
  });
}

/** Merge open questions and confidence notes, removing near-duplicates */
function mergeUncertainties(openQuestions: string[], confidenceNotes: string[]): string[] {
  const all = [...openQuestions, ...confidenceNotes];
  const unique: string[] = [];
  for (const item of all) {
    const lower = item.toLowerCase();
    const isDup = unique.some(existing => {
      const existLower = existing.toLowerCase();
      // Simple overlap check
      const words = lower.split(/\s+/).filter(w => w.length > 4);
      if (words.length === 0) return false;
      const overlap = words.filter(w => existLower.includes(w)).length;
      return overlap / words.length > 0.7;
    });
    if (!isDup) unique.push(item);
  }
  return unique;
}

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
    <Badge variant="outline" className={`text-xs shrink-0 ${evidenceStyles[strength] || ''}`}>
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
// === REPORT GENERATION ===
// ============================================================

/** Generate a clean, non-redundant text report from the analysis result */
function generateReport(result: VoiceAnalysisResult): string {
  const lines: string[] = [];

  lines.push('Mögliche Migräne-Zusammenhänge');
  lines.push(`Analysezeitraum: ${result.scope.daysAnalyzed} Tage`);
  lines.push('');

  // Summary
  lines.push('Einordnung');
  lines.push(result.summary);
  lines.push('');

  // Patterns
  const sorted = sortPatterns(result.possiblePatterns);
  if (sorted.length > 0) {
    lines.push('Mögliche Einflussfaktoren');
    for (const p of sorted) {
      const label = evidenceLabels[p.evidenceStrength] || '';
      lines.push(`• ${p.title} (${label})`);
      lines.push(`  ${p.description}`);
    }
    lines.push('');
  }

  // Recurring sequences
  if (result.recurringSequences.length > 0) {
    lines.push('Wiederkehrende Muster');
    for (const s of result.recurringSequences) {
      lines.push(`• ${s.pattern}${s.count > 1 ? ` (${s.count}×)` : ''}`);
      if (s.llmInterpretation) lines.push(`  ${s.llmInterpretation}`);
    }
    lines.push('');
  }

  // Uncertainties
  const uncertainties = mergeUncertainties(result.openQuestions, result.confidenceNotes);
  if (uncertainties.length > 0) {
    lines.push('Was noch unklar ist');
    for (const u of uncertainties) {
      lines.push(`• ${u}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Hinweis: Mögliche Zusammenhänge – keine medizinische Diagnose.');

  return lines.join('\n');
}

// ============================================================
// === RESULTS DISPLAY ===
// ============================================================

function AnalysisResults({ result }: { result: VoiceAnalysisResult }) {
  const [showReport, setShowReport] = useState(false);

  const { sortedPatterns, extraContextFindings, uncertainties } = useMemo(() => {
    const sorted = sortPatterns(result.possiblePatterns);

    // Merge pain + relevant fatigue + medication findings, then deduplicate against patterns
    const painFindings = result.painContextFindings;
    const fatigueFiltered = result.fatigueContextFindings.filter(f =>
      f.evidenceStrength !== 'low' ||
      /schmerz|kopf|migräne|belastung|erschöpf/i.test(f.observation)
    );
    const allContext = [...painFindings, ...fatigueFiltered, ...result.medicationContextFindings];
    const deduped = deduplicateFindings(allContext, sorted);

    const merged = mergeUncertainties(result.openQuestions, result.confidenceNotes);

    return { sortedPatterns: sorted, extraContextFindings: deduped, uncertainties: merged };
  }, [result]);

  const hasPatterns = sortedPatterns.length > 0;
  const hasExtraContext = extraContextFindings.length > 0;
  const hasSequences = result.recurringSequences.length > 0;
  const hasUncertainties = uncertainties.length > 0;

  return (
    <div className="space-y-5">
      {/* 1. Summary — always shown */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-sm leading-relaxed">{result.summary}</p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            {result.scope.daysAnalyzed} Tage analysiert
            {result.scope.painEntryCount > 0 && ` · ${result.scope.painEntryCount} Schmerzeinträge`}
            {result.scope.voiceEventCount > 0 && ` · ${result.scope.voiceEventCount} Sprachnotizen`}
          </p>
        </CardContent>
      </Card>

      {/* 2. Possible patterns / trigger candidates — sorted by relevance */}
      {hasPatterns && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Mögliche Einflussfaktoren</h3>
          </div>
          <div className="space-y-2">
            {sortedPatterns.map((p, i) => (
              <PatternCard key={i} pattern={p} />
            ))}
          </div>
        </div>
      )}

      {/* 3. Recurring sequences — only if not already covered by patterns */}
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

      {/* 4. Extra context findings — only those NOT already in patterns */}
      {hasExtraContext && extraContextFindings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-muted-foreground">Weitere Beobachtungen</h3>
          </div>
          <ul className="space-y-1.5">
            {extraContextFindings.slice(0, 5).map((f, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="mt-1 shrink-0">•</span>
                <span>{f.observation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. What's still unclear — merged, deduplicated */}
      {hasUncertainties && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-muted-foreground">Was noch unklar ist</h3>
          </div>
          <ul className="space-y-1.5">
            {uncertainties.map((item, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="mt-1 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Report action + disclaimer */}
      <div className="flex flex-col items-center gap-3 pt-2 border-t border-border/50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowReport(!showReport)}
        >
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          {showReport ? 'Bericht schließen' : 'Als Bericht anzeigen'}
        </Button>
        <p className="text-xs text-muted-foreground/60 text-center">
          Mögliche Zusammenhänge · keine medizinische Diagnose
        </p>
      </div>

      {/* Report view */}
      {showReport && (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Analysebericht</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const text = generateReport(result);
                  navigator.clipboard.writeText(text);
                }}
              >
                Kopieren
              </Button>
            </div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {generateReport(result)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// === WEAK DATA UX ===
// ============================================================

function WeakDataMessage() {
  return (
    <Card className="border-muted bg-muted/20">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Brain className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Noch nicht genug Daten für klare Muster</h4>
            <p className="text-sm text-muted-foreground">
              Die Analyse braucht mehr dokumentierte Tage, um mögliche Zusammenhänge erkennen zu können.
              Je regelmäßiger du einträgst, desto aussagekräftiger wird die Auswertung.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Tipp: Auch schmerzfreie Tage und Alltagsbeobachtungen helfen bei der Mustererkennung.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// === MAIN COMPONENT ===
// ============================================================

export function MigrainePatternAnalysis() {
  const { from, to } = useTimeRange();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingCache, setIsLoadingCache] = useState(true);
  const [result, setResult] = useState<VoiceAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWeakData, setIsWeakData] = useState(false);
  const [isCachedResult, setIsCachedResult] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  // Load cached analysis on mount or when range changes
  useEffect(() => {
    let cancelled = false;
    setIsLoadingCache(true);
    setResult(null);
    setError(null);
    setIsWeakData(false);
    setIsCachedResult(false);
    setCachedAt(null);

    (async () => {
      try {
        const selection = await selectAnalysisForChannel(from, to, 'app');
        if (cancelled) return;

        if (selection.result) {
          if (isAnalysisUnavailable(selection.result)) {
            setIsWeakData(true);
          } else {
            setResult(selection.result);
            setIsCachedResult(true);
            setCachedAt(selection.result.meta?.analyzedAt || null);
            // Note: selection.isFresh indicates whether data has changed since analysis
            // For now we show stale results normally — user can re-run if needed
          }
        }
      } catch (err) {
        // Cache load failure is non-critical
        console.warn('[MigrainePatternAnalysis] Cache load failed:', err);
      } finally {
        if (!cancelled) setIsLoadingCache(false);
      }
    })();

    return () => { cancelled = true; };
  }, [from, to]);

  const runAnalysis = useCallback(async () => {
    setError(null);
    setIsWeakData(false);
    setIsAnalyzing(true);
    setIsCachedResult(false);

    try {
      const range = {
        from: new Date(from + 'T00:00:00'),
        to: new Date(to + 'T23:59:59'),
      };

      const analysisResult = await runVoicePatternAnalysis(range);

      if (isAnalysisUnavailable(analysisResult)) {
        setIsWeakData(true);
        setResult(null);
      } else {
        setResult(analysisResult);

        // Persist result (fire-and-forget)
        saveAnalysisResult(analysisResult, from, to)
          .then(() => setCachedAt(new Date().toISOString()))
          .catch(err => console.warn('[MigrainePatternAnalysis] Save failed:', err));
      }
    } catch (err) {
      logError('MigrainePatternAnalysis.run', err);
      const msg = err instanceof Error ? err.message : 'Analyse fehlgeschlagen';
      if (msg.includes('Rate Limit')) {
        setError('Bitte warte einen Moment, bevor du erneut analysierst.');
      } else if (msg.includes('Guthaben')) {
        setError('Monatliches Analyselimit erreicht. Nächsten Monat stehen dir wieder Analysen zur Verfügung.');
      } else if (msg.includes('Keine Daten')) {
        setError('Im gewählten Zeitraum sind keine Daten vorhanden.');
      } else {
        setError('Die Analyse konnte nicht durchgeführt werden. Bitte versuche es später erneut.');
      }
      setResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, [from, to]);

  // Format cached-at date for display
  const cachedAtLabel = useMemo(() => {
    if (!cachedAt) return null;
    try {
      const d = new Date(cachedAt);
      const day = d.getDate();
      const months = ['Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
      const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      return `${day}. ${months[d.getMonth()]} ${time}`;
    } catch {
      return null;
    }
  }, [cachedAt]);

  return (
    <div className="space-y-5">
      {/* Info */}
      <Alert className="border-primary/20 bg-primary/5">
        <Brain className="h-4 w-4" />
        <AlertDescription>
          <p className="text-sm text-muted-foreground">
            Sucht in deinen Einträgen nach möglichen Zusammenhängen mit Migräne.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Hinweise, keine Diagnose · Ergebnisse mit Arzt besprechen
          </p>
        </AlertDescription>
      </Alert>

      {/* Controls */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <TimeRangeSelector />
          
          <Button
            onClick={runAnalysis}
            disabled={isAnalyzing || isLoadingCache}
            className="w-full"
            size="lg"
          >
            {isAnalyzing ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyse läuft …</>
            ) : result ? (
              <><RefreshCw className="h-4 w-4 mr-2" /> Erneut analysieren</>
            ) : (
              <><Brain className="h-4 w-4 mr-2" /> Zusammenhänge suchen</>
            )}
          </Button>

          {/* Cache status indicator */}
          {isCachedResult && cachedAtLabel && (
            <p className="text-xs text-muted-foreground/60 text-center flex items-center justify-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              Gespeicherte Analyse vom {cachedAtLabel}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Loading cache */}
      {isLoadingCache && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

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

      {/* Weak data */}
      {isWeakData && <WeakDataMessage />}

      {/* Results */}
      {result && <AnalysisResults result={result} />}

      {/* Empty state */}
      {!result && !isAnalyzing && !isLoadingCache && !error && !isWeakData && (
        <div className="text-center py-10 text-muted-foreground">
          <Brain className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Wähle einen Zeitraum und starte die Analyse</p>
          <p className="text-xs mt-1 opacity-70">
            Sucht nach möglichen Mustern und Einflussfaktoren für Migräne
          </p>
        </div>
      )}
    </div>
  );
}
