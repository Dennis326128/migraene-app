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
import { Brain, Loader2, AlertCircle, RefreshCw, FileText, CheckCircle2, Clock, Lock, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { TimeRangeSelector } from './TimeRangeSelector';
import { runVoicePatternAnalysis } from '@/lib/voice/analysisEngine';
import { isAnalysisUnavailable, type VoiceAnalysisResult, type PatternFinding, type ContextFinding } from '@/lib/voice/analysisTypes';
import { selectAnalysisForChannel, saveAnalysisResult, loadAnalysisHistory, loadAnalysisById, deleteAnalysisById, type AnalysisHistoryEntry, MAX_PATTERNS, MAX_SEQUENCES, MAX_QUESTIONS, EVIDENCE_ORDER } from '@/lib/voice/analysisCache';
import { isTrivialSequence, isBanalContent, isGenericUncertainty, isWeakPattern, cleanSummaryFiller, GENERIC_PHASE_SEQUENCES, BANAL_INTERPRETATION_RX, MEDICATION_TITLE_RX } from '@/lib/voice/analysisFilters';
import { logError } from '@/lib/utils/errorMessages';
import { gateDecision, isCacheStaleByAge, berlinDayStart, berlinDayEnd, STALE_AFTER_DAYS } from '@/lib/voice/analysisGate';
import { useAnalysisGateState } from '@/lib/voice/useAnalysisGateState';
import { AIConsentToggle } from './Settings/AIConsentToggle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AnalysisV21Sections } from './AnalysisV21Sections';
import { AnalysisProgressLoader } from './AnalysisProgressLoader';
import { AnalysisHistoryList } from './AnalysisHistoryList';
import { decideCachedAnalysisDisplay } from '@/lib/voice/cachedAnalysisDisplay';
import { evaluateReAnalyzeGate } from '@/lib/ai/analysisRateGate';
import { ANALYSIS_V21_VERSION } from '@/lib/ai/analysisTypes';

// Filter logic is centralized in analysisFilters.ts for testability

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

/** Sort patterns: higher evidence first, then medication-priority, then by occurrence count */
function sortPatterns(patterns: PatternFinding[]): PatternFinding[] {
  return [...patterns].sort((a, b) => {
    const ePri = (EVIDENCE_ORDER[b.evidenceStrength] || 0) - (EVIDENCE_ORDER[a.evidenceStrength] || 0);
    if (ePri !== 0) return ePri;
    // Within same evidence tier: medication patterns first (check title + description)
    const isMed = (p: PatternFinding) =>
      MEDICATION_PATTERN_TYPES.has(p.patternType) || MEDICATION_TITLE_RX.test(p.title) || MEDICATION_TITLE_RX.test(p.description) ? 1 : 0;
    const medDiff = isMed(b) - isMed(a);
    if (medDiff !== 0) return medDiff;
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
    if (isBanalContent(item)) continue;
    if (isGenericUncertainty(item)) continue;
    if (overlapsAny(item, refTexts, 0.40)) continue;
    if (overlapsAny(item, unique, 0.50)) continue;
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

// `generateReport` now delegates to the shared, testable
// `generateAnalysisReportText` helper. For V2.1 results it builds the
// report from the SAME normalized findings the UI renders, so copy/paste
// text and screen stay in sync. Legacy results keep the previous renderer.
import { generateAnalysisReportText } from '@/lib/ai/generateAnalysisReportText';

function generateReport(result: VoiceAnalysisResult): string {
  return generateAnalysisReportText(result);
}

// ============================================================
// === RESULTS DISPLAY ===
// ============================================================

function AnalysisResults({ result }: { result: VoiceAnalysisResult }) {
  const [showReport, setShowReport] = useState(false);
  const v21 = (result as any)?.analysisV21 ?? null;
  if (v21) {
    return (
      <div className="space-y-7">
        <AnalysisV21Sections responseJson={result} />
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
        </div>
        {showReport && (
          <div className="rounded-lg bg-muted/10 px-5 py-4">
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
              {generateReport(result)}
            </pre>
          </div>
        )}
      </div>
    );
  }


  const { sortedPatterns, filteredSequences, extraContextFindings, uncertainties, cleanedSummary } = useMemo(() => {
    // Clean summary filler starters
    const cleanedSummary = cleanSummaryFiller(result.summary);

    // Sort, filter weak, and limit patterns
    let sorted = sortPatterns(result.possiblePatterns)
      .filter(p => !isWeakPattern(p.description, p.title))
      .filter(p => !isBanalContent(p.description))
      .slice(0, MAX_PATTERNS);
    
    // Intra-pattern dedup: remove patterns that largely repeat an earlier one or summary
    // Bidirectional: check both "pattern words in summary" AND "summary words in pattern"
    const dedupedPatterns: PatternFinding[] = [];
    for (const p of sorted) {
      const pText = p.title + ' ' + p.description;
      // Bidirectional overlap: suppress if either direction shows strong overlap
      const pInSummary = textOverlap(pText, cleanedSummary);
      const summaryInP = textOverlap(cleanedSummary, pText);
      // Tighter threshold if both summary and pattern are about medication
      const bothMed = MEDICATION_TITLE_RX.test(cleanedSummary) && MEDICATION_TITLE_RX.test(pText);
      const summaryThreshold = bothMed ? 0.45 : 0.30;
      if (Math.max(pInSummary, summaryInP) > summaryThreshold) continue;
      if (overlapsAny(pText, dedupedPatterns.map(d => d.title + ' ' + d.description), 0.28)) continue;
      dedupedPatterns.push(p);
    }
    sorted = dedupedPatterns;

    // Filter trivial sequences; also reject if interpretation is banal or too short
    // Additionally dedup sequences against pattern titles, descriptions, AND summary
    const patternRefTexts = sorted.map(p => p.title + ' ' + p.description);
    const patternDescriptions = sorted.map(p => p.description);
    const patternTitles = sorted.map(p => p.title);
    const seqs = result.recurringSequences
      .filter(s => {
        if (isTrivialSequence(s.pattern, s.llmInterpretation)) return false;
        if (!s.llmInterpretation || s.llmInterpretation.length < 35) return false;
        if (s.count < 2) return false;
        if (isBanalContent(s.llmInterpretation)) return false;
        if (isGenericUncertainty(s.llmInterpretation)) return false;
        if (isWeakPattern(s.llmInterpretation)) return false;
        if (overlapsAny(s.llmInterpretation, patternRefTexts, 0.22)) return false;
        if (overlapsAny(s.llmInterpretation, patternDescriptions, 0.25)) return false;
        if (overlapsAny(s.llmInterpretation, patternTitles, 0.25)) return false;
        if (overlapsAny(s.llmInterpretation, [cleanedSummary], 0.22)) return false;
        return true;
      })
      .slice(0, MAX_SEQUENCES);

    // Reference pool for deduplication
    const allRefTexts = [
      cleanedSummary,
      ...patternRefTexts,
      ...seqs.map(s => s.pattern + ' ' + (s.llmInterpretation || '')),
    ];

    // Fatigue findings: accept medium+ with broader keyword set (incl. fatigue/PEM/Energie)
    const fatigueFiltered = result.fatigueContextFindings.filter(f =>
      (f.evidenceStrength === 'high' || f.evidenceStrength === 'medium' || f.evidenceStrength === 'low') &&
      /schmerz|kopf|migräne|attacke|triptan|fatigue|pem|energie|erschöpf|belastung|crash/i.test(f.observation)
    );
    // Medication context: keep if not already dominant in patterns/summary
    const hasMedPattern = sorted.some(p => MEDICATION_PATTERN_TYPES.has(p.patternType) || MEDICATION_TITLE_RX.test(p.title) || MEDICATION_TITLE_RX.test(p.description));
    const hasMedSummary = MEDICATION_TITLE_RX.test(cleanedSummary);
    const medContext = (hasMedPattern || hasMedSummary)
      ? result.medicationContextFindings.filter(f => f.evidenceStrength !== 'high').slice(0, 2)
      : result.medicationContextFindings;
    const allContext = [...result.painContextFindings, ...fatigueFiltered, ...medContext];
    const finalContext = allContext
      .filter(f => !isBanalContent(f.observation))
      .filter(f => f.observation.length >= 30)
      .filter(f => !overlapsAny(f.observation, allRefTexts, 0.22))
      .slice(0, 8);

    // Uncertainties: allow up to MAX_QUESTIONS, slightly looser quality bar
    const fullRef = [
      ...allRefTexts,
      ...finalContext.map(f => f.observation),
    ];
    const merged = mergeUncertainties(
      result.openQuestions.slice(0, MAX_QUESTIONS),
      result.confidenceNotes,
      fullRef,
    ).filter(item => item.length >= 30 && !isBanalContent(item)).slice(0, MAX_QUESTIONS);

    return { sortedPatterns: sorted, filteredSequences: seqs, extraContextFindings: finalContext, uncertainties: merged, cleanedSummary };
  }, [result]);

  const hasPatterns = sortedPatterns.length > 0;
  // Only show sequences if at least one has count > 1
  const hasSequences = filteredSequences.length > 0;
  const hasExtraContext = extraContextFindings.length > 0;
  const hasUncertainties = uncertainties.length > 0;

  const pre = (result as any)._preAnalysis as undefined | {
    weather: { daysWithData: number; pressureDropDays: number; pressureRiseDays: number; painOnDropDays: number; painOnRiseDays: number; painOnStableDays: number; stableDays: number; pressureMin: number | null; pressureMax: number | null; tempMin: number | null; tempMax: number | null; note: string };
    time: { topWeekday: string | null; topWeekdayShare: number; topPhase: string | null; topPhaseShare: number; weekdayCount: number; weekendCount: number; withTime: number; note: string };
    mecfs: { daysWithMecfs: number; contextNoteCount: number; note: string };
    medication: { intakeCount: number; highPainEntries: number; highPainWithMed: number; highPainWithoutMed: number; note: string };
    dataQuality: { painEntries: number; voiceEvents: number; weatherDays: number; rangeDays: number; note: string };
  };

  // Keyword filters for routing context findings into themed sections
  const RX = {
    weather: /wetter|luftdruck|hpa|temperatur|föhn|niederschlag|feucht|barometr|witterung/i,
    time: /uhrzeit|tageszeit|tagesphase|wochentag|werktag|wochenende|nachts?|morgens?|abend|nachmittag/i,
    mecfs: /me\/cfs|me-cfs|mecfs|fatigue|pem|crash|erschöpf|energie|belastungsintoler/i,
    medication: /medika|triptan|akutmittel|tablette|spray|wirkst|moh|übergebr|schmerzmitt/i,
  };
  const findInContext = (rx: RegExp) =>
    extraContextFindings.filter(f => rx.test(f.observation));
  const findInPatterns = (rx: RegExp) =>
    sortedPatterns.filter(p => rx.test(p.title) || rx.test(p.description));

  const weatherFromLLM = [...findInPatterns(RX.weather), ...findInContext(RX.weather)];
  const timeFromLLM = [...findInPatterns(RX.time), ...findInContext(RX.time)];
  const mecfsFromLLM = [
    ...findInPatterns(RX.mecfs),
    ...result.fatigueContextFindings.filter(f => f.observation.length >= 10),
  ];
  const medFromLLM = [...findInPatterns(RX.medication), ...result.medicationContextFindings];

  return (
    <div className="space-y-7">
      {/* 1. Einordnung */}
      <div className="pb-1">
        <p className="text-[13px] leading-[1.7] text-foreground">{cleanedSummary}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-2.5">
          {result.scope.daysAnalyzed} Tage analysiert
          {result.scope.painEntryCount > 0 && ` · ${result.scope.painEntryCount} Schmerzeinträge`}
          {result.scope.voiceEventCount > 0 && ` · ${result.scope.voiceEventCount} Notizen`}
        </p>
      </div>

      {/* 2. Auffälligste Hinweise */}
      <SectionWrapper title="Auffälligste Hinweise">
        {hasPatterns ? (
          <div className="space-y-5">
            {sortedPatterns.filter(p => p.evidenceStrength !== 'low').map((p, i) => (
              <PatternBlock key={i} p={p} />
            ))}
            {sortedPatterns.filter(p => p.evidenceStrength !== 'low').length === 0 && (
              <EmptyHint>Keine Hauptmuster mit mittlerer/hoher Evidenz erkannt.</EmptyHint>
            )}
          </div>
        ) : (
          <EmptyHint>Kein klares Hauptmuster erkennbar.</EmptyHint>
        )}
      </SectionWrapper>

      {/* 3. Weitere mögliche Zusammenhänge (low evidence + extra context) */}
      <SectionWrapper title="Weitere mögliche Zusammenhänge">
        {(() => {
          const lowPatterns = sortedPatterns.filter(p => p.evidenceStrength === 'low');
          const items = [
            ...lowPatterns.map((p, i) => (
              <li key={`p-${i}`} className="text-[13px] text-foreground/75 flex items-start gap-2 leading-[1.7]">
                <span className="mt-[9px] h-1 w-1 rounded-full bg-muted-foreground/30 shrink-0" />
                <span><span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-1.5">schwacher Hinweis ·</span>{p.title}: {p.description}</span>
              </li>
            )),
            ...extraContextFindings.map((f, i) => (
              <li key={`f-${i}`} className="text-[13px] text-foreground/75 flex items-start gap-2 leading-[1.7]">
                <span className="mt-[9px] h-1 w-1 rounded-full bg-muted-foreground/30 shrink-0" />
                <span>
                  {f.evidenceStrength === 'low' && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-1.5">schwacher Hinweis ·</span>
                  )}
                  {f.observation}
                </span>
              </li>
            )),
          ];
          return items.length > 0 ? <ul className="space-y-2">{items}</ul> : <EmptyHint>Keine weiteren Hinweise erkennbar.</EmptyHint>;
        })()}
      </SectionWrapper>

      {/* 4. Wiederkehrende Sequenzen */}
      {hasSequences && (
        <SectionWrapper title="Wiederkehrende Muster">
          <div className="space-y-3">
            {filteredSequences.map((seq, i) => (
              <div key={i}>
                <span className="text-[13px] font-medium text-foreground">{translateSequencePattern(seq.pattern)}</span>
                {seq.count > 1 && <span className="text-[11px] text-muted-foreground/70 ml-1.5">({seq.count}×)</span>}
                {seq.llmInterpretation && <p className="text-[13px] text-foreground/75 leading-[1.7] mt-0.5">{seq.llmInterpretation}</p>}
              </div>
            ))}
          </div>
        </SectionWrapper>
      )}

      {/* 5. Wetter & Umwelt */}
      <SectionWrapper title="Wetter & Umwelt">
        {weatherFromLLM.length > 0 ? (
          <ContextList items={weatherFromLLM.map(it => 'observation' in it ? it.observation : `${it.title}: ${it.description}`)} />
        ) : pre && pre.weather.daysWithData > 0 ? (
          <p className="text-[13px] text-foreground/75 leading-[1.7]">{pre.weather.note}</p>
        ) : (
          <EmptyHint>{pre ? pre.weather.note : 'Daten nicht ausreichend.'}</EmptyHint>
        )}
      </SectionWrapper>

      {/* 6. Zeitmuster */}
      <SectionWrapper title="Zeitmuster">
        {timeFromLLM.length > 0 ? (
          <ContextList items={timeFromLLM.map(it => 'observation' in it ? it.observation : `${it.title}: ${it.description}`)} />
        ) : pre && (pre.time.topWeekday || pre.time.withTime > 0) ? (
          <p className="text-[13px] text-foreground/75 leading-[1.7]">{pre.time.note}</p>
        ) : (
          <EmptyHint>Kein Zeitmuster erkennbar.</EmptyHint>
        )}
      </SectionWrapper>

      {/* 7. ME/CFS & Energie */}
      <SectionWrapper title="ME/CFS & Energie">
        {mecfsFromLLM.length > 0 ? (
          <ContextList items={mecfsFromLLM.map(it => 'observation' in it ? it.observation : `${it.title}: ${it.description}`)} />
        ) : pre ? (
          <p className="text-[13px] text-foreground/75 leading-[1.7]">{pre.mecfs.note}</p>
        ) : (
          <EmptyHint>Daten nicht ausreichend dokumentiert.</EmptyHint>
        )}
      </SectionWrapper>

      {/* 8. Medikamente */}
      <SectionWrapper title="Medikamente">
        {medFromLLM.length > 0 ? (
          <ContextList items={medFromLLM.map(it => 'observation' in it ? it.observation : `${it.title}: ${it.description}`)} />
        ) : pre ? (
          <p className="text-[13px] text-foreground/75 leading-[1.7]">{pre.medication.note}</p>
        ) : (
          <EmptyHint>Keine Medikamenten-Auffälligkeiten erkennbar.</EmptyHint>
        )}
      </SectionWrapper>

      {/* 9. Datenqualität — immer sichtbar */}
      <SectionWrapper title="Datenqualität">
        <div className="space-y-1.5">
          {pre && <p className="text-[13px] text-foreground/75 leading-[1.7]">{pre.dataQuality.note}</p>}
          {result.confidenceNotes.length > 0 && (
            <ul className="space-y-1.5 mt-1">
              {result.confidenceNotes.slice(0, 4).map((n, i) => (
                <li key={i} className="text-[12px] text-foreground/65 flex items-start gap-2 leading-[1.6]">
                  <span className="mt-[8px] h-1 w-1 rounded-full bg-muted-foreground/30 shrink-0" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionWrapper>

      {/* 10. Was unklar bleibt */}
      <SectionWrapper title="Was unklar bleibt">
        {hasUncertainties ? (
          <ul className="space-y-2">
            {uncertainties.map((item, i) => (
              <li key={i} className="text-[13px] text-foreground/75 flex items-start gap-2 leading-[1.7]">
                <span className="mt-[9px] h-1 w-1 rounded-full bg-muted-foreground/30 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyHint>Keine offenen Fragen vermerkt.</EmptyHint>
        )}
      </SectionWrapper>

      {/* Report button + disclaimer */}
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
        <p className="text-[10px] text-muted-foreground/50 text-center">
          Mögliche Zusammenhänge · keine medizinische Diagnose
        </p>
      </div>

      {/* Report view */}
      {showReport && (
        <div className="rounded-lg bg-muted/10 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80">Analysebericht</h4>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => { navigator.clipboard.writeText(generateReport(result)); }}
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

// === Section helper components ===
function SectionWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function PatternBlock({ p }: { p: PatternFinding }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h4 className="text-[13px] font-medium text-foreground leading-snug">{p.title}</h4>
        <EvidenceBadge strength={p.evidenceStrength} />
      </div>
      <p className="text-[13px] text-foreground/75 leading-[1.7]">{p.description}</p>
      {p.uncertaintyNotes.length > 0 && (
        <p className="text-[11px] text-muted-foreground/70 mt-1.5">{p.uncertaintyNotes[0].reason}</p>
      )}
    </div>
  );
}

function ContextList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="text-[13px] text-foreground/75 flex items-start gap-2 leading-[1.7]">
          <span className="mt-[9px] h-1 w-1 rounded-full bg-muted-foreground/30 shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-muted-foreground/70 italic leading-[1.6]">{children}</p>;
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isWeakData, setIsWeakData] = useState(false);
  const [isCachedResult, setIsCachedResult] = useState(false);
  const [isStaleResult, setIsStaleResult] = useState(false);
  const [staleReason, setStaleReason] = useState<'data_changed' | 'version_mismatch' | 'range_mismatch' | null>(null);
  const [isRangeFallback, setIsRangeFallback] = useState(false);
  const [fallbackRange, setFallbackRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [showFallbackAnalysis, setShowFallbackAnalysis] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [storedSignature, setStoredSignature] = useState<string | null>(null);
  const [currentSignature, setCurrentSignature] = useState<string | null>(null);
  const [gateRefresh, setGateRefresh] = useState(0);

  // === History (independent of selected range) ===
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  /** When set, we show this stored analysis instead of the cached one for the current range. */
  const [pickedHistory, setPickedHistory] = useState<{
    id: string;
    createdAt: string;
    fromDate: string;
    toDate: string;
  } | null>(null);

  const HISTORY_PAGE_SIZE = 10;

  const reloadHistory = useCallback(async () => {
    try {
      const { entries, hasMore } = await loadAnalysisHistory({ limit: HISTORY_PAGE_SIZE, offset: 0 });
      setHistory(entries);
      setHistoryHasMore(hasMore);
    } catch (err) {
      console.warn('[MigrainePatternAnalysis] history load failed:', err);
    }
  }, []);

  useEffect(() => {
    reloadHistory();
  }, [reloadHistory]);

  const handleLoadMoreHistory = useCallback(async () => {
    setHistoryLoadingMore(true);
    try {
      const { entries, hasMore } = await loadAnalysisHistory({
        limit: HISTORY_PAGE_SIZE,
        offset: history.length,
      });
      setHistory(prev => [...prev, ...entries]);
      setHistoryHasMore(hasMore);
    } catch (err) {
      console.warn('[MigrainePatternAnalysis] history load-more failed:', err);
    } finally {
      setHistoryLoadingMore(false);
    }
  }, [history.length]);

  const handlePickHistory = useCallback(async (entry: AnalysisHistoryEntry) => {
    try {
      const cached = await loadAnalysisById(entry.id);
      if (!cached) {
        toast.error('Analyse konnte nicht geladen werden.');
        return;
      }
      setResult(cached.result);
      setIsCachedResult(true);
      setIsWeakData(false);
      setError(null);
      // Range fallback display: if entry range != selected range, mark accordingly.
      const sameRange = entry.fromDate === from && entry.toDate === to;
      setIsRangeFallback(!sameRange);
      setFallbackRange({ from: entry.fromDate, to: entry.toDate });
      setShowFallbackAnalysis(true);
      setStaleReason(sameRange ? null : 'range_mismatch');
      setIsStaleResult(!sameRange);
      setCachedAt(cached.createdAt);
      setStoredSignature(cached.dataStateSignature);
      setPickedHistory({
        id: entry.id,
        createdAt: cached.createdAt,
        fromDate: entry.fromDate,
        toDate: entry.toDate,
      });
    } catch (err) {
      console.warn('[MigrainePatternAnalysis] pick history failed:', err);
      toast.error('Analyse konnte nicht geladen werden.');
    }
  }, [from, to]);

  const handleDeleteHistory = useCallback(async (entry: AnalysisHistoryEntry) => {
    const ok = await deleteAnalysisById(entry.id);
    if (!ok) {
      toast.error('Analyse konnte nicht gelöscht werden.');
      return;
    }
    const wasOpen =
      pickedHistory?.id === entry.id ||
      (isCachedResult && cachedAt && entry.createdAt === cachedAt);
    if (wasOpen) {
      setResult(null);
      setIsCachedResult(false);
      setIsStaleResult(false);
      setStaleReason(null);
      setIsRangeFallback(false);
      setFallbackRange({ from: null, to: null });
      setShowFallbackAnalysis(false);
      setCachedAt(null);
      setPickedHistory(null);
    }
    await reloadHistory();
    toast.success('Analyse gelöscht');
  }, [pickedHistory, isCachedResult, cachedAt, reloadHistory]);


  const gateState = useAnalysisGateState(gateRefresh);

  // Freshness is data-driven only (range/version/data signature via selectAnalysisForChannel).
  // No time-based staleness — an analysis stays "current" as long as the underlying data didn't change.
  const effectiveStale = isStaleResult;

  const decision = useMemo(() => gateDecision({
    hasConsent: gateState.hasConsent,
    aiEnabled: gateState.aiEnabled,
    isUnlimited: gateState.isUnlimited,
    usageCount: gateState.usageCount,
    limit: gateState.limit,
    cooldownRemaining: gateState.cooldownRemaining,
    hasCache: !!result,
    isStale: effectiveStale,
  }), [gateState, result, effectiveStale]);

  // Re-analyze cooldown (UX-side, separate from server quota cooldown).
  // Uses the data_state_signature from analysisCache.ts as SSOT so we
  // don't reinvent a parallel fingerprint.
  const rateGate = useMemo(() => evaluateReAnalyzeGate({
    lastCreatedAt: cachedAt,
    lastAnalysisVersion: (result as any)?.analysis_version ?? null,
    currentAnalysisVersion: ANALYSIS_V21_VERSION,
    lastDataSignature: storedSignature,
    currentDataSignature: currentSignature,
  }), [cachedAt, result, storedSignature, currentSignature]);



  useEffect(() => {
    let cancelled = false;
    setIsLoadingCache(true);
    setResult(null);
    setError(null);
    setErrorCode(null);
    setIsWeakData(false);
    setIsCachedResult(false);
    setIsStaleResult(false);
    setStaleReason(null);
    setIsRangeFallback(false);
    setFallbackRange({ from: null, to: null });
    setShowFallbackAnalysis(false);
    setCachedAt(null);
    setPickedHistory(null);

    (async () => {
      try {
        const selection = await selectAnalysisForChannel(from, to, 'app');
        if (cancelled) return;
        setStoredSignature(selection.storedSignature);
        setCurrentSignature(selection.currentSignature);
        if (selection.result) {
          if (isAnalysisUnavailable(selection.result)) {
            setIsWeakData(true);
          } else {
            setResult(selection.result);
            setIsCachedResult(true);
            setIsStaleResult(!selection.isFresh);
            setStaleReason(selection.staleReason);
            setIsRangeFallback(selection.isRangeFallback === true);
            setFallbackRange({
              from: selection.resultFromDate ?? null,
              to: selection.resultToDate ?? null,
            });
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
    if (!decision.canRunAnalysis) return; // safety: never call edge if gate says no
    setError(null);
    setErrorCode(null);
    setIsWeakData(false);
    setIsAnalyzing(true);

    try {
      const range = { from: berlinDayStart(from), to: berlinDayEnd(to) };
      const analysisResult = await runVoicePatternAnalysis(range);

      if (isAnalysisUnavailable(analysisResult)) {
        setIsWeakData(true);
      } else {
        setResult(analysisResult);
        setIsCachedResult(false);
        setIsStaleResult(false);
        setCachedAt(new Date().toISOString());
        setPickedHistory(null);
        saveAnalysisResult(analysisResult, from, to)
          .then(() => reloadHistory())
          .catch(err => console.warn('[MigrainePatternAnalysis] Save failed:', err));
      }
    } catch (err) {
      logError('MigrainePatternAnalysis.run', err);
      const code = (err as any)?.code as string | undefined;
      setErrorCode(code ?? 'UNKNOWN');
      const messages: Record<string, string> = {
        AI_CONSENT_REQUIRED: 'Für die KI-Analyse ist deine Einwilligung erforderlich.',
        AI_DISABLED: 'KI-Analyse ist in den Einstellungen deaktiviert.',
        QUOTA_EXCEEDED: 'Du hast dein monatliches Analyselimit erreicht. Vorhandene Analyse bleibt sichtbar.',
        COOLDOWN_ACTIVE: 'Bitte kurz warten, bevor du erneut analysierst.',
        INSUFFICIENT_DATA: 'Im gewählten Zeitraum sind zu wenige Daten für eine Analyse vorhanden.',
        CONTEXT_TOO_LARGE: 'Der gewählte Zeitraum ist zu groß. Bitte einen kürzeren Zeitraum wählen.',
        TIMEOUT: 'Die Analyse hat zu lange gedauert. Bitte später erneut versuchen.',
        LLM_UNAVAILABLE: 'Der KI-Dienst ist vorübergehend nicht verfügbar. Bitte später erneut versuchen.',
        AUTH_REQUIRED: 'Sitzung abgelaufen. Bitte erneut anmelden.',
        UNKNOWN: 'Die Analyse konnte nicht durchgeführt werden. Bitte versuche es später erneut.',
      };
      setError(messages[code ?? 'UNKNOWN'] ?? messages.UNKNOWN);
    } finally {
      setIsAnalyzing(false);
      setGateRefresh(n => n + 1); // reload quota/cooldown after attempt
    }
  }, [from, to, decision.canRunAnalysis]);

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

  // === Button label / disabled state from gate ===
  const rateBlocked = !rateGate.allowed && rateGate.reason === 'cooldown_active';
  const buttonDisabled = isAnalyzing || isLoadingCache || gateState.loading || !decision.canRunAnalysis || rateBlocked;

  const cooldownLabel = (() => {
    const s = gateState.cooldownRemaining;
    if (s <= 0) return null;
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  })();

  return (
    <div className="space-y-5">
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

      {/* CONSENT BLOCK */}
      {!gateState.loading && decision.action === 'block_consent' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Für die KI-Analyse ist deine Einwilligung erforderlich.</p>
                <p className="text-xs text-muted-foreground">DSGVO Art. 9 (Gesundheitsdaten). Du kannst dies jederzeit widerrufen.</p>
              </div>
            </div>
            <AIConsentToggle onChanged={(next) => { if (next) setGateRefresh(n => n + 1); }} />
          </CardContent>
        </Card>
      )}

      {/* AI DISABLED BLOCK */}
      {!gateState.loading && decision.action === 'block_ai_disabled' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">KI-Analyse ist in deinen Einstellungen deaktiviert.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Du kannst sie hier aktivieren oder später in den Einstellungen anpassen.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={async () => {
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) {
                    toast.error('Nicht angemeldet.');
                    return;
                  }
                  const { error } = await supabase
                    .from('user_profiles')
                    .update({ ai_enabled: true })
                    .eq('user_id', user.id);
                  if (error) throw error;
                  toast.success('KI-Analyse aktiviert');
                  setGateRefresh(n => n + 1);
                } catch (e: any) {
                  console.error('[MigrainePatternAnalysis] enable AI error', e);
                  toast.error(e?.message ?? 'Aktivieren fehlgeschlagen.');
                }
              }}
            >
              KI-Analyse aktivieren
            </Button>
          </CardContent>
        </Card>
      )}

      {/* CONTROLS — only when gate not blocking on consent/AI-disabled */}
      {decision.action !== 'block_consent' && decision.action !== 'block_ai_disabled' && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <TimeRangeSelector />
            <Button
              onClick={runAnalysis}
              disabled={buttonDisabled}
              className="w-full"
              size="lg"
            >
              {isAnalyzing ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Analyse läuft …</>
              ) : decision.action === 'block_quota' ? (
                <><Lock className="h-4 w-4 mr-2" /> Limit erreicht ({gateState.usageCount}/{gateState.limit})</>
              ) : decision.action === 'block_cooldown' ? (
                <><Clock className="h-4 w-4 mr-2" /> Erneut möglich in {cooldownLabel}</>
              ) : rateBlocked ? (
                <><Clock className="h-4 w-4 mr-2" /> Neue Analyse in ca. {rateGate.waitMinutes} Min. möglich</>
              ) : result ? (
                <><RefreshCw className="h-4 w-4 mr-2" /> {effectiveStale ? (staleReason === 'range_mismatch' ? 'Für diesen Zeitraum analysieren' : staleReason === 'version_mismatch' ? 'Analyse-Logik wurde verbessert' : 'Neue Daten vorhanden') : 'Erneut analysieren'}</>
              ) : (
                <><Brain className="h-4 w-4 mr-2" /> Zusammenhänge suchen</>
              )}

            </Button>

            {/* Quota status (always visible when free user) */}
            {!gateState.isUnlimited && !gateState.loading && (
              <p className="text-[11px] text-muted-foreground text-center">
                {gateState.usageCount}/{gateState.limit} Analysen diesen Monat
                {decision.action === 'block_quota' && ' · vorhandene Analyse bleibt sichtbar'}
              </p>
            )}

            {/* Cache badge */}
            {isCachedResult && cachedAtLabel && !effectiveStale && (
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Aktuell · vom {cachedAtLabel}
              </p>
            )}
            {isCachedResult && effectiveStale && staleReason !== 'range_mismatch' && (() => {
              const reasonText = ageStale
                ? `Diese Analyse ist älter als ${STALE_AFTER_DAYS} Tage. Eine neue Analyse kann aktuellere Hinweise liefern.`
                : staleReason === 'version_mismatch'
                  ? 'Analyse-Logik wurde verbessert. Erstelle eine neue Analyse, um die aktualisierte Auswertung zu erhalten.'
                  : 'Seit dieser Analyse wurden Einträge geändert oder ergänzt.';
              const badge = ageStale
                ? `älter als ${STALE_AFTER_DAYS} Tage`
                : staleReason === 'version_mismatch'
                  ? 'Analyse-Logik aktualisiert'
                  : 'Daten geändert';
              return (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-center space-y-1">
                  <p className="text-[11px] text-amber-900 dark:text-amber-200 flex items-center justify-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    Veraltet{cachedAtLabel ? ` · ${cachedAtLabel}` : ''} ({badge})
                  </p>
                  <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
                    {reasonText}
                  </p>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {isAnalyzing && <AnalysisProgressLoader />}


      {isLoadingCache && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-muted/30 px-4 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-foreground/80">{error}</p>
              {errorCode === 'AI_CONSENT_REQUIRED' ? (
                <div className="mt-2">
                  <AIConsentToggle onChanged={(next) => { if (next) setGateRefresh(n => n + 1); }} />
                </div>
              ) : errorCode === 'QUOTA_EXCEEDED' || errorCode === 'COOLDOWN_ACTIVE' ? null : (
                <Button onClick={runAnalysis} variant="ghost" size="sm" className="mt-2" disabled={buttonDisabled}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Erneut versuchen
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {isWeakData && <WeakDataMessage />}

      {(() => {
        const mode = decideCachedAnalysisDisplay({
          hasResult: !!result,
          staleReason,
          showFallbackAnalysis,
        });

        // Range mismatch without explicit pick → just show CTA + history list.
        if (mode === 'range_mismatch_preview' && history.length === 0) {
          return (
            <div
              className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              data-testid="range-mismatch-preview"
            >
              <p className="text-xs text-muted-foreground">
                Für diesen Zeitraum liegt noch keine Analyse vor.
              </p>
              <Button
                onClick={runAnalysis}
                disabled={buttonDisabled}
                size="sm"
                variant="outline"
                className="shrink-0"
              >
                {rateBlocked ? (
                  <><Clock className="h-4 w-4 mr-2" /> In ca. {rateGate.waitMinutes} Min.</>
                ) : (
                  <><Brain className="h-4 w-4 mr-2" /> Diesen Zeitraum analysieren</>
                )}
              </Button>
            </div>
          );
        }

        if (mode === 'range_mismatch_full' && result) {
          const fromLabel = pickedHistory?.fromDate ?? fallbackRange.from;
          const toLabel = pickedHistory?.toDate ?? fallbackRange.to;
          const createdLabel = pickedHistory
            ? new Date(pickedHistory.createdAt).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : cachedAtLabel;
          return (
            <>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-center space-y-0.5" data-testid="range-mismatch-badge">
                <p className="text-[11px] text-amber-900 dark:text-amber-200 flex items-center justify-center gap-1.5">
                  <AlertCircle className="h-3 w-3" />
                  Gespeicherte Analyse{createdLabel ? ` vom ${createdLabel}` : ''}
                </p>
                {fromLabel && toLabel && (
                  <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
                    Angezeigte Analyse: {fromLabel} – {toLabel}
                  </p>
                )}
              </div>
              <AnalysisResults result={result} />
            </>
          );
        }

        if (mode === 'render_full' && result) {
          return <AnalysisResults result={result} />;
        }

        return null;
      })()}

      {/* Historie — sichtbar sobald mindestens eine gespeicherte Analyse existiert */}
      {!isLoadingCache && history.length > 0 && (
        <AnalysisHistoryList
          entries={history}
          selectedFrom={from}
          selectedTo={to}
          currentSignature={currentSignature}
          activeId={pickedHistory?.id ?? null}
          hasMore={historyHasMore}
          loadingMore={historyLoadingMore}
          onSelect={handlePickHistory}
          onLoadMore={handleLoadMoreHistory}
          onDelete={handleDeleteHistory}
        />
      )}

      {/* Empty State: nur wenn wirklich keine Analyse existiert */}
      {!result && !isAnalyzing && !isLoadingCache && !error && !isWeakData && history.length === 0 && decision.canRunAnalysis && (
        <div className="text-center py-10">
          <Brain className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-foreground/70">Wähle einen Zeitraum und starte die erste Analyse.</p>
          <p className="text-xs mt-1 text-muted-foreground">
            Sucht nach möglichen Mustern und Einflussfaktoren für Migräne
          </p>
        </div>
      )}
    </div>
  );
}
