/**
 * MigrainePatternAnalysis.tsx
 * 
 * Premium, calm display of AI migraine pattern analysis.
 * Structure: Kurzfazit → Auffälligste Hinweise → Wiederkehrende Muster →
 *            Was zusätzlich auffällt → Was noch unklar ist → Disclaimer
 * 
 * Design: no card borders on individual items, strong typography hierarchy,
 *         readable text (not washed-out grey), German-only UI.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Brain, Loader2, AlertCircle, RefreshCw, FileText, CheckCircle2 } from 'lucide-react';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { TimeRangeSelector } from './TimeRangeSelector';
import { runVoicePatternAnalysis } from '@/lib/voice/analysisEngine';
import { isAnalysisUnavailable, type VoiceAnalysisResult, type PatternFinding, type ContextFinding } from '@/lib/voice/analysisTypes';
import { selectAnalysisForChannel, saveAnalysisResult, MAX_PATTERNS, MAX_SEQUENCES, MAX_QUESTIONS, EVIDENCE_ORDER } from '@/lib/voice/analysisCache';
import { logError } from '@/lib/utils/errorMessages';

// ============================================================
// === CONTENT FILTERING & HELPERS ===
// ============================================================

/** Trivial/tautological sequence patterns to suppress */
const TRIVIAL_SEQUENCE_PATTERNS = [
  // Pain → obvious reaction (trivial)
  /schmerz.*→.*medikament/i,
  /medikament.*→.*schmerz/i,
  /kopfschmerz.*→.*medikament/i,
  /kopfschmerz.*→.*ruhe/i,
  /kopfschmerz.*→.*schlaf/i,
  /migräne.*→.*medikament/i,
  /migräne.*→.*ruhe/i,
  /schmerz.*stärker.*→.*medikament/i,
  /schmerz.*→.*einnahme/i,
  /schmerz.*→.*triptan/i,
  /schmerz.*→.*bett/i,
  /schmerz.*→.*liegen/i,
  /schmerz.*→.*hinlegen/i,
  /schmerz.*→.*ruhe/i,
  /schmerz.*→.*schlaf/i,
  /schmerz.*→.*nichts/i,
  /schmerz.*→.*pause/i,
  /schmerz.*→.*dunkel/i,
  // Fatigue → obvious reaction (trivial)
  /müdigkeit.*→.*ruhe/i,
  /müdigkeit.*→.*schlaf/i,
  /müdigkeit.*→.*bett/i,
  /müdigkeit.*schmerztag/i,
  /müde.*→.*ruhe/i,
  /müde.*→.*schlaf/i,
  /erschöpf.*→.*ruhe/i,
  /erschöpf.*→.*schlaf/i,
  /erschöpf.*→.*bett/i,
  /erschöpf.*→.*hinlegen/i,
  /erschöpfung.*zusammen.*schmerz/i,
  // English variants
  /pain.*→.*medication/i,
  /medication.*→.*pain/i,
  /headache.*→.*rest/i,
  /fatigue.*→.*rest/i,
  /fatigue.*→.*sleep/i,
  // Phase-based trivial sequences
  /^pain→medication$/i,
  /^pain→rest$/i,
  /^fatigue→rest$/i,
  /^medication→observation$/i,
];

function isTrivialSequence(pattern: string): boolean {
  const normalized = pattern.replace(/\s+/g, ' ').trim();
  return TRIVIAL_SEQUENCE_PATTERNS.some(rx => rx.test(normalized));
}

/** Additional check: phase-based sequences that are too generic */
function isGenericPhaseSequence(pattern: string): boolean {
  const p = pattern.toLowerCase().replace(/\s/g, '');
  const generic = [
    'pain→medication', 'pain→rest', 'pain→fatigue', 'fatigue→rest',
    'medication→observation', 'medication→rest', 'pain→observation',
    'fatigue→medication', 'observation→pain', 'observation→medication',
    'rest→observation', 'wellbeing→observation',
  ];
  return generic.includes(p);
}

/** Translate English arrow-patterns to German */
function translateSequencePattern(pattern: string): string {
  return pattern
    .replace(/pain/gi, 'Schmerz')
    .replace(/medication/gi, 'Medikament')
    .replace(/headache/gi, 'Kopfschmerz')
    .replace(/rest/gi, 'Ruhe')
    .replace(/sleep/gi, 'Schlaf')
    .replace(/stress/gi, 'Stress')
    .replace(/fatigue/gi, 'Erschöpfung')
    .replace(/light/gi, 'Licht')
    .replace(/noise/gi, 'Lärm')
    .replace(/weather/gi, 'Wetter')
    .replace(/→/g, ' → ');
}

/** Sort patterns: higher evidence first, then by occurrence count */
function sortPatterns(patterns: PatternFinding[]): PatternFinding[] {
  return [...patterns].sort((a, b) => {
    const ePri = (EVIDENCE_ORDER[b.evidenceStrength] || 0) - (EVIDENCE_ORDER[a.evidenceStrength] || 0);
    if (ePri !== 0) return ePri;
    return b.occurrences - a.occurrences;
  });
}

/** Deduplicate context findings that overlap with pattern descriptions or other text pools */
function deduplicateFindings(
  findings: ContextFinding[],
  patterns: PatternFinding[],
  additionalTexts: string[] = [],
): ContextFinding[] {
  const refTexts = [
    ...patterns.map(p => (p.title + ' ' + p.description).toLowerCase()),
    ...additionalTexts.map(t => t.toLowerCase()),
  ];
  if (refTexts.length === 0) return findings;

  return findings.filter(f => {
    const obsLower = f.observation.toLowerCase();
    const words = obsLower.split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return true;
    return !refTexts.some(pt => {
      const matchCount = words.filter(w => pt.includes(w)).length;
      return matchCount / words.length > 0.5; // stricter threshold
    });
  });
}

/** Merge and deduplicate uncertainties */
function mergeUncertainties(openQuestions: string[], confidenceNotes: string[]): string[] {
  const all = [...openQuestions, ...confidenceNotes];
  const unique: string[] = [];
  for (const item of all) {
    const lower = item.toLowerCase();
    const isDup = unique.some(existing => {
      const existLower = existing.toLowerCase();
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
// === EVIDENCE LABELS (German only) ===
// ============================================================

const evidenceLabels: Record<string, string> = {
  low: 'Erste Hinweise',
  medium: 'Mehrere Hinweise',
  high: 'Deutliche Hinweise',
};

function EvidenceBadge({ strength }: { strength: string }) {
  const colorMap: Record<string, string> = {
    high: 'bg-primary/8 text-primary',
    medium: 'bg-muted text-muted-foreground',
    low: 'bg-muted/50 text-muted-foreground',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] tracking-wide ${colorMap[strength] || colorMap.low}`}>
      {evidenceLabels[strength] || strength}
    </span>
  );
}

// ============================================================
// === REPORT TEXT GENERATION ===
// ============================================================

function generateReport(result: VoiceAnalysisResult): string {
  const lines: string[] = [];
  lines.push('Mögliche Migräne-Zusammenhänge');
  lines.push(`Analysezeitraum: ${result.scope.daysAnalyzed} Tage`);
  lines.push('');
  lines.push('Einordnung');
  lines.push(result.summary);
  lines.push('');

  const sorted = sortPatterns(result.possiblePatterns).slice(0, MAX_PATTERNS);
  if (sorted.length > 0) {
    lines.push('Auffälligste Hinweise');
    for (const p of sorted) {
      lines.push(`• ${p.title} (${evidenceLabels[p.evidenceStrength] || ''})`);
      lines.push(`  ${p.description}`);
    }
    lines.push('');
  }

  const sequences = result.recurringSequences
    .filter(s => !isTrivialSequence(s.pattern) && !isGenericPhaseSequence(s.pattern))
    .slice(0, MAX_SEQUENCES);
  if (sequences.length > 0) {
    lines.push('Wiederkehrende Muster');
    for (const s of sequences) {
      const label = translateSequencePattern(s.pattern);
      lines.push(`• ${label}${s.count > 1 ? ` (${s.count}×)` : ''}`);
      if (s.llmInterpretation) lines.push(`  ${s.llmInterpretation}`);
    }
    lines.push('');
  }

  const uncertainties = mergeUncertainties(
    result.openQuestions.slice(0, MAX_QUESTIONS),
    result.confidenceNotes,
  ).slice(0, MAX_QUESTIONS);
  if (uncertainties.length > 0) {
    lines.push('Was noch unklar ist');
    for (const u of uncertainties) lines.push(`• ${u}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('Hinweis: Mögliche Zusammenhänge – keine medizinische Diagnose.');
  return lines.join('\n');
}

// ============================================================
// === RESULTS DISPLAY — NEW CALM STRUCTURE ===
// ============================================================

function AnalysisResults({ result }: { result: VoiceAnalysisResult }) {
  const [showReport, setShowReport] = useState(false);

  const { sortedPatterns, filteredSequences, extraContextFindings, uncertainties } = useMemo(() => {
    const sorted = sortPatterns(result.possiblePatterns).slice(0, MAX_PATTERNS);

    // Filter trivial and generic phase sequences
    const seqs = result.recurringSequences
      .filter(s => !isTrivialSequence(s.pattern) && !isGenericPhaseSequence(s.pattern))
      .slice(0, MAX_SEQUENCES);

    // Build full dedup reference texts: patterns + sequences + summary
    const seqTexts = seqs.map(s => (s.pattern + ' ' + (s.llmInterpretation || '')));
    const allRefTexts = [...seqTexts, result.summary];

    // Context findings: merge relevant ones, deduplicate against patterns AND sequences AND summary
    const fatigueFiltered = result.fatigueContextFindings.filter(f =>
      f.evidenceStrength !== 'low' ||
      /schmerz|kopf|migräne|belastung|reiz/i.test(f.observation)
    );
    const allContext = [...result.painContextFindings, ...fatigueFiltered, ...result.medicationContextFindings];
    const finalContext = deduplicateFindings(allContext, sorted, allRefTexts).slice(0, 3);

    // Uncertainties: deduplicate against patterns and context findings
    const allPatternAndContextTexts = [
      ...sorted.map(p => p.title + ' ' + p.description),
      ...finalContext.map(f => f.observation),
      ...seqTexts,
    ];
    const merged = mergeUncertainties(
      result.openQuestions.slice(0, MAX_QUESTIONS),
      result.confidenceNotes,
    ).filter(u => {
      const uLower = u.toLowerCase();
      const words = uLower.split(/\s+/).filter(w => w.length > 4);
      if (words.length === 0) return true;
      return !allPatternAndContextTexts.some(ref => {
        const refLower = ref.toLowerCase();
        const overlap = words.filter(w => refLower.includes(w)).length;
        return overlap / words.length > 0.6;
      });
    }).slice(0, MAX_QUESTIONS);

    return { sortedPatterns: sorted, filteredSequences: seqs, extraContextFindings: finalContext, uncertainties: merged };
  }, [result]);

  const hasPatterns = sortedPatterns.length > 0;
  const hasSequences = filteredSequences.length > 0;
  const hasExtraContext = extraContextFindings.length > 0;
  const hasUncertainties = uncertainties.length > 0;

  return (
    <div className="space-y-7">
      {/* A) Kurzfazit */}
      <div className="px-1">
        <p className="text-[13px] leading-[1.7] text-foreground">{result.summary}</p>
        <p className="text-[11px] text-muted-foreground mt-2">
          {result.scope.daysAnalyzed} Tage analysiert
          {result.scope.painEntryCount > 0 && ` · ${result.scope.painEntryCount} Schmerzeinträge`}
          {result.scope.voiceEventCount > 0 && ` · ${result.scope.voiceEventCount} Notizen`}
        </p>
      </div>

      {/* B) Auffälligste Hinweise */}
      {hasPatterns && (
        <section className="px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Auffälligste Hinweise
          </h3>
          <div className="space-y-5">
            {sortedPatterns.map((p, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h4 className="text-[13px] font-medium text-foreground leading-snug">{p.title}</h4>
                  <EvidenceBadge strength={p.evidenceStrength} />
                </div>
                <p className="text-[13px] text-foreground/75 leading-[1.65]">{p.description}</p>
                {p.uncertaintyNotes.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {p.uncertaintyNotes[0].reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* C) Wiederkehrende Muster — only non-trivial */}
      {hasSequences && (
        <section className="px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Wiederkehrende Muster
          </h3>
          <div className="space-y-3">
            {filteredSequences.map((seq, i) => (
              <div key={i}>
                <span className="text-[13px] font-medium text-foreground">
                  {translateSequencePattern(seq.pattern)}
                </span>
                {seq.count > 1 && (
                  <span className="text-[11px] text-muted-foreground ml-1.5">({seq.count}×)</span>
                )}
                {seq.llmInterpretation && (
                  <p className="text-[13px] text-foreground/75 leading-[1.65] mt-0.5">{seq.llmInterpretation}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* D) Was zusätzlich auffällt — only if real extras exist */}
      {hasExtraContext && (
        <section className="px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            Was zusätzlich auffällt
          </h3>
          <ul className="space-y-1.5">
            {extraContextFindings.map((f, i) => (
              <li key={i} className="text-[13px] text-foreground/75 flex items-start gap-2.5 leading-[1.65]">
                <span className="mt-[9px] h-[3px] w-[3px] rounded-full bg-muted-foreground/30 shrink-0" />
                <span>{f.observation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* E) Was noch unklar ist */}
      {hasUncertainties && (
        <section className="px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            Was noch unklar ist
          </h3>
          <ul className="space-y-1.5">
            {uncertainties.map((item, i) => (
              <li key={i} className="text-[13px] text-foreground/75 flex items-start gap-2.5 leading-[1.65]">
                <span className="mt-[9px] h-[3px] w-[3px] rounded-full bg-muted-foreground/30 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* F) Report button + disclaimer */}
      <div className="flex flex-col items-center gap-1.5 pt-2 px-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowReport(!showReport)}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          <FileText className="h-3 w-3 mr-1.5" />
          {showReport ? 'Bericht schließen' : 'Als Bericht anzeigen'}
        </Button>
        <p className="text-[10px] text-muted-foreground/70 text-center">
          Mögliche Zusammenhänge · keine medizinische Diagnose
        </p>
      </div>

      {/* Report view */}
      {showReport && (
        <div className="rounded-lg bg-muted/20 px-5 py-4 mx-1">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Analysebericht</h4>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                navigator.clipboard.writeText(generateReport(result));
              }}
            >
              Kopieren
            </Button>
          </div>
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
            {generateReport(result)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================
// === WEAK DATA MESSAGE ===
// ============================================================

function WeakDataMessage() {
  return (
    <div className="rounded-lg bg-muted/30 px-5 py-5">
      <div className="flex items-start gap-3">
        <Brain className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-foreground">Noch nicht genug Daten für klare Muster</h4>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Die Analyse braucht mehr dokumentierte Tage, um mögliche Zusammenhänge erkennen zu können.
            Je regelmäßiger du einträgst, desto aussagekräftiger wird die Auswertung.
          </p>
          <p className="text-xs text-muted-foreground">
            Tipp: Auch schmerzfreie Tage und Alltagsbeobachtungen helfen bei der Mustererkennung.
          </p>
        </div>
      </div>
    </div>
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
  const [isStaleResult, setIsStaleResult] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCache(true);
    setResult(null);
    setError(null);
    setIsWeakData(false);
    setIsCachedResult(false);
    setIsStaleResult(false);
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
            setIsStaleResult(!selection.isFresh);
            setCachedAt(selection.result.meta?.analyzedAt || null);
          }
        }
      } catch (err) {
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
    setIsStaleResult(false);

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
      {/* Intro */}
      <div className="rounded-lg bg-primary/5 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Brain className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-foreground/80">
              Sucht in deinen Einträgen nach möglichen Zusammenhängen mit Migräne.
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Hinweise, keine Diagnose · Ergebnisse mit Arzt besprechen
            </p>
          </div>
        </div>
      </div>

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

          {/* Cache status */}
          {isCachedResult && cachedAtLabel && !isStaleResult && (
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              Analyse vom {cachedAtLabel}
            </p>
          )}
          {isCachedResult && isStaleResult && (
            <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
              Älterer Datenstand{cachedAtLabel ? ` (${cachedAtLabel})` : ''} · erneut analysieren für aktuelle Ergebnisse
            </p>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoadingCache && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-muted/30 px-4 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-foreground/80">{error}</p>
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
        </div>
      )}

      {/* Weak data */}
      {isWeakData && <WeakDataMessage />}

      {/* Results */}
      {result && <AnalysisResults result={result} />}

      {/* Empty state */}
      {!result && !isAnalyzing && !isLoadingCache && !error && !isWeakData && (
        <div className="text-center py-10">
          <Brain className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-foreground/70">Wähle einen Zeitraum und starte die Analyse</p>
          <p className="text-xs mt-1 text-muted-foreground">
            Sucht nach möglichen Mustern und Einflussfaktoren für Migräne
          </p>
        </div>
      )}
    </div>
  );
}
