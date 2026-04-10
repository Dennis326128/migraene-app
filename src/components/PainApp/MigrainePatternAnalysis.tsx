/**
 * MigrainePatternAnalysis.tsx
 * 
 * Calm, high-quality display of AI migraine pattern analysis.
 * Structure: Kurzfazit → Auffälligste Hinweise → Wiederkehrende Muster →
 *            Was zusätzlich auffällt → Was noch unklar ist → Disclaimer
 * 
 * Design: no card borders, strong readable typography, German-only.
 * Sections are hidden if they have no meaningful content.
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
  // Pain → obvious reaction
  /schmerz.*→.*medikament/i, /medikament.*→.*schmerz/i,
  /kopfschmerz.*→.*medikament/i, /kopfschmerz.*→.*ruhe/i, /kopfschmerz.*→.*schlaf/i,
  /migräne.*→.*medikament/i, /migräne.*→.*ruhe/i, /migräne.*→.*schlaf/i,
  /schmerz.*stärker.*→.*medikament/i, /schmerz.*→.*einnahme/i, /schmerz.*→.*triptan/i,
  /schmerz.*→.*bett/i, /schmerz.*→.*liegen/i, /schmerz.*→.*hinlegen/i,
  /schmerz.*→.*ruhe/i, /schmerz.*→.*schlaf/i,
  /schmerz.*→.*nichts/i, /schmerz.*→.*pause/i, /schmerz.*→.*dunkel/i,
  /schmerz.*→.*erbrechen/i, /schmerz.*→.*übelkeit/i,
  /schmerz.*→.*rückzug/i, /schmerz.*→.*schonung/i,
  // Strong day → retreat (trivial)
  /stark.*tag.*→.*ruhe/i, /stark.*tag.*→.*rückzug/i, /stark.*tag.*→.*bett/i,
  /beschwerden.*→.*schonung/i, /beschwerden.*→.*rückzug/i, /beschwerden.*→.*ruhe/i,
  /belastung.*→.*ruhe/i, /belastung.*→.*pause/i,
  // Fatigue → obvious reaction
  /müdigkeit.*→.*ruhe/i, /müdigkeit.*→.*schlaf/i, /müdigkeit.*→.*bett/i,
  /müdigkeit.*schmerztag/i, /müde.*→.*ruhe/i, /müde.*→.*schlaf/i,
  /erschöpf.*→.*ruhe/i, /erschöpf.*→.*schlaf/i, /erschöpf.*→.*bett/i,
  /erschöpf.*→.*hinlegen/i, /erschöpfung.*zusammen.*schmerz/i,
  /erschöpf.*→.*pause/i, /erschöpf.*→.*nichts/i,
  /erschöpf.*→.*rückzug/i, /erschöpf.*→.*schonung/i,
  // Medication → obvious observation
  /medikament.*→.*wirkung/i, /medikament.*→.*besser/i,
  /medikament.*→.*keine.*wirkung/i, /triptan.*→.*besser/i,
  /einnahme.*→.*wirkung/i, /einnahme.*→.*besser/i,
  /medikament.*→.*beobacht/i, /einnahme.*→.*beobacht/i,
  // English variants
  /pain.*→.*medication/i, /medication.*→.*pain/i,
  /headache.*→.*rest/i, /fatigue.*→.*rest/i, /fatigue.*→.*sleep/i,
  /pain.*→.*rest/i, /pain.*→.*sleep/i,
  // Generic co-occurrence (not a pattern)
  /schmerz.*müdigkeit/i, /müdigkeit.*schmerz/i,
  /schmerz.*erschöpf/i, /erschöpf.*schmerz/i,
  // Additional banalities
  /attacke.*→.*ruhe/i, /attacke.*→.*bett/i, /attacke.*→.*schlaf/i,
  /anfall.*→.*ruhe/i, /anfall.*→.*medikament/i,
  /beschwerd.*→.*medikament/i, /beschwerd.*→.*bett/i,
  /schmerz.*→.*abbruch/i, /schmerz.*→.*absage/i,
  /übelkeit.*→.*ruhe/i, /übelkeit.*→.*bett/i,
  /kopfschmerz.*→.*rückzug/i, /kopfschmerz.*→.*schonung/i,
  /migräne.*→.*rückzug/i, /migräne.*→.*schonung/i, /migräne.*→.*bett/i,
  /migräne.*→.*dunkel/i, /migräne.*→.*hinlegen/i,
];

/** Phase-state arrow patterns that are always generic */
const GENERIC_PHASE_SEQUENCES = new Set([
  'pain→medication', 'pain→rest', 'pain→fatigue', 'pain→observation',
  'fatigue→rest', 'fatigue→medication', 'fatigue→observation',
  'medication→observation', 'medication→rest', 'medication→pain',
  'observation→pain', 'observation→medication', 'observation→rest',
  'rest→observation', 'rest→pain', 'wellbeing→observation',
  'pain→medication→rest', 'pain→medication→observation',
  'medication→rest→observation', 'fatigue→rest→observation',
  'pain→rest→observation',
]);

/** Banal llmInterpretation phrases that add no insight */
const BANAL_INTERPRETATION_RX = [
  /wurde.*medikament.*eingenommen/i, /medikament.*eingenommen.*bei.*schmerz/i,
  /nach.*schmerz.*ruhe/i, /ruhe.*nach.*schmerz/i,
  /beschwerden.*führten.*zu.*rückzug/i, /übliche.*reaktion/i,
  /typische.*begleiter/i, /naheliegende.*reaktion/i,
  /selbstverständlich/i,
];

function isTrivialSequence(pattern: string, interpretation?: string): boolean {
  const normalized = pattern.replace(/\s+/g, ' ').trim();
  if (TRIVIAL_SEQUENCE_PATTERNS.some(rx => rx.test(normalized))) return true;
  // Also check as generic phase sequence
  const collapsed = normalized.toLowerCase().replace(/\s/g, '');
  if (GENERIC_PHASE_SEQUENCES.has(collapsed)) return true;
  // Also check if interpretation itself is banal
  if (interpretation && BANAL_INTERPRETATION_RX.some(rx => rx.test(interpretation))) return true;
  return false;
}

/** Translate English arrow-patterns to German */
function translateSequencePattern(pattern: string): string {
  return pattern
    .replace(/pain/gi, 'Schmerz').replace(/medication/gi, 'Medikament')
    .replace(/headache/gi, 'Kopfschmerz').replace(/rest/gi, 'Ruhe')
    .replace(/sleep/gi, 'Schlaf').replace(/stress/gi, 'Stress')
    .replace(/fatigue/gi, 'Erschöpfung').replace(/light/gi, 'Licht')
    .replace(/noise/gi, 'Lärm').replace(/weather/gi, 'Wetter')
    .replace(/observation/gi, 'Beobachtung').replace(/exertion/gi, 'Belastung')
    .replace(/→/g, ' → ');
}

/** Medication-related pattern types that get priority boost within same evidence tier */
const MEDICATION_PATTERN_TYPES = new Set(['medication_context', 'trigger_candidate']);
const MEDICATION_TITLE_RX = /triptan|medikament|akutmedikament|übergebrauch|einnahme|vermeidung|zurückhalt/i;

/** Sort patterns: higher evidence first, then medication-priority, then by occurrence count */
function sortPatterns(patterns: PatternFinding[]): PatternFinding[] {
  return [...patterns].sort((a, b) => {
    const ePri = (EVIDENCE_ORDER[b.evidenceStrength] || 0) - (EVIDENCE_ORDER[a.evidenceStrength] || 0);
    if (ePri !== 0) return ePri;
    // Within same evidence tier: medication patterns first
    const aMed = MEDICATION_PATTERN_TYPES.has(a.patternType) || MEDICATION_TITLE_RX.test(a.title) ? 1 : 0;
    const bMed = MEDICATION_PATTERN_TYPES.has(b.patternType) || MEDICATION_TITLE_RX.test(b.title) ? 1 : 0;
    if (bMed !== aMed) return bMed - aMed;
    return b.occurrences - a.occurrences;
  });
}

/**
 * Compute word-overlap ratio between two texts.
 * Returns 0–1 where 1 = all significant words of `a` found in `b`.
 */
function textOverlap(a: string, b: string): number {
  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (wordsA.length === 0) return 0;
  const bLower = b.toLowerCase();
  const matched = wordsA.filter(w => bLower.includes(w)).length;
  return matched / wordsA.length;
}

/** Check if text significantly overlaps with any reference text */
function overlapsAny(text: string, refs: string[], threshold = 0.38): boolean {
  return refs.some(ref => textOverlap(text, ref) > threshold);
}

/** Deduplicate context findings against patterns, sequences, summary */
function deduplicateFindings(
  findings: ContextFinding[],
  patterns: PatternFinding[],
  additionalTexts: string[] = [],
): ContextFinding[] {
  const refTexts = [
    ...patterns.map(p => (p.title + ' ' + p.description)),
    ...additionalTexts,
  ];
  if (refTexts.length === 0) return findings;
  return findings.filter(f => !overlapsAny(f.observation, refTexts));
}

/** Merge and deduplicate uncertainties against each other AND against reference texts */
function mergeUncertainties(
  openQuestions: string[],
  confidenceNotes: string[],
  refTexts: string[] = [],
): string[] {
  const all = [...openQuestions, ...confidenceNotes];
  const unique: string[] = [];
  for (const item of all) {
    // Skip if overlaps with reference texts (patterns, findings, summary)
    if (overlapsAny(item, refTexts, 0.5)) continue;
    // Skip if overlaps with already-added uncertainties
    if (overlapsAny(item, unique, 0.6)) continue;
    unique.push(item);
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] tracking-wide shrink-0 ${colorMap[strength] || colorMap.low}`}>
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
    .filter(s => !isTrivialSequence(s.pattern, s.llmInterpretation))
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

  lines.push('---');
  lines.push('Hinweis: Mögliche Zusammenhänge – keine medizinische Diagnose.');
  return lines.join('\n');
}

// ============================================================
// === RESULTS DISPLAY ===
// ============================================================

function AnalysisResults({ result }: { result: VoiceAnalysisResult }) {
  const [showReport, setShowReport] = useState(false);

  const { sortedPatterns, filteredSequences, extraContextFindings, uncertainties } = useMemo(() => {
    const sorted = sortPatterns(result.possiblePatterns).slice(0, MAX_PATTERNS);

    // Filter trivial sequences strictly, then also check for weak-only leftovers
    const seqs = result.recurringSequences
      .filter(s => !isTrivialSequence(s.pattern, s.llmInterpretation) && s.llmInterpretation && s.llmInterpretation.length > 10)
      .slice(0, MAX_SEQUENCES);

    // Reference pool for deduplication: summary + patterns + sequences
    const allRefTexts = [
      result.summary,
      ...sorted.map(p => p.title + ' ' + p.description),
      ...seqs.map(s => s.pattern + ' ' + (s.llmInterpretation || '')),
    ];

    // Context findings: only migraine-relevant fatigue, deduplicated
    // Fatigue findings: ONLY high evidence, or medium with explicit migraine keywords
    const fatigueFiltered = result.fatigueContextFindings.filter(f =>
      f.evidenceStrength === 'high' ||
      (f.evidenceStrength === 'medium' && /schmerz|kopf|migräne|attacke|triptan/i.test(f.observation))
    );
    // Medication context: skip if any pattern already covers medication topic
    const hasMedPattern = sorted.some(p => MEDICATION_PATTERN_TYPES.has(p.patternType) || MEDICATION_TITLE_RX.test(p.title));
    const medContext = hasMedPattern ? [] : result.medicationContextFindings;
    const allContext = [...result.painContextFindings, ...fatigueFiltered, ...medContext];
    // Strict dedup threshold (0.35) to catch more overlaps
    const finalContext = allContext
      .filter(f => !overlapsAny(f.observation, allRefTexts, 0.35))
      .slice(0, 2);

    // Uncertainties: deduplicated against everything above with even stricter threshold
    const fullRef = [
      ...allRefTexts,
      ...finalContext.map(f => f.observation),
    ];
    const merged = mergeUncertainties(
      result.openQuestions.slice(0, MAX_QUESTIONS),
      result.confidenceNotes,
      fullRef,
    ).slice(0, MAX_QUESTIONS);

    return { sortedPatterns: sorted, filteredSequences: seqs, extraContextFindings: finalContext, uncertainties: merged };
  }, [result]);

  const hasPatterns = sortedPatterns.length > 0;
  const hasSequences = filteredSequences.length > 0;
  const hasExtraContext = extraContextFindings.length > 0;
  const hasUncertainties = uncertainties.length > 0;

  return (
    <div className="space-y-6">
      {/* A) Kurzfazit */}
      <div>
        <p className="text-sm leading-relaxed text-foreground">{result.summary}</p>
        <p className="text-[11px] text-muted-foreground mt-2">
          {result.scope.daysAnalyzed} Tage analysiert
          {result.scope.painEntryCount > 0 && ` · ${result.scope.painEntryCount} Schmerzeinträge`}
          {result.scope.voiceEventCount > 0 && ` · ${result.scope.voiceEventCount} Notizen`}
        </p>
      </div>

      {/* B) Auffälligste Hinweise */}
      {hasPatterns && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Auffälligste Hinweise
          </h3>
          <div className="space-y-4">
            {sortedPatterns.map((p, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-3 mb-0.5">
                  <h4 className="text-sm font-medium text-foreground leading-snug">{p.title}</h4>
                  <EvidenceBadge strength={p.evidenceStrength} />
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{p.description}</p>
                {p.uncertaintyNotes.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">
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
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
            Wiederkehrende Muster
          </h3>
          <div className="space-y-2.5">
            {filteredSequences.map((seq, i) => (
              <div key={i}>
                <span className="text-sm font-medium text-foreground">
                  {translateSequencePattern(seq.pattern)}
                </span>
                {seq.count > 1 && (
                  <span className="text-[11px] text-muted-foreground ml-1.5">({seq.count}×)</span>
                )}
                {seq.llmInterpretation && (
                  <p className="text-sm text-foreground/80 leading-relaxed mt-0.5">{seq.llmInterpretation}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* D) Was zusätzlich auffällt */}
      {hasExtraContext && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Was zusätzlich auffällt
          </h3>
          <ul className="space-y-1.5">
            {extraContextFindings.map((f, i) => (
              <li key={i} className="text-sm text-foreground/80 flex items-start gap-2 leading-relaxed">
                <span className="mt-[8px] h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                <span>{f.observation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* E) Was noch unklar ist */}
      {hasUncertainties && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Was noch unklar ist
          </h3>
          <ul className="space-y-1.5">
            {uncertainties.map((item, i) => (
              <li key={i} className="text-sm text-foreground/80 flex items-start gap-2 leading-relaxed">
                <span className="mt-[8px] h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* F) Report button + disclaimer */}
      <div className="flex flex-col items-center gap-1.5 pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowReport(!showReport)}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          <FileText className="h-3 w-3 mr-1.5" />
          {showReport ? 'Bericht schließen' : 'Als Bericht anzeigen'}
        </Button>
        <p className="text-[10px] text-muted-foreground/60 text-center">
          Mögliche Zusammenhänge · keine medizinische Diagnose
        </p>
      </div>

      {/* Report view */}
      {showReport && (
        <div className="rounded-lg bg-muted/15 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Analysebericht</h4>
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
            <p className="text-[11px] text-muted-foreground/70 text-center">
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
