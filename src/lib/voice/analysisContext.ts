/**
 * analysisContext.ts
 * Pure transformation layer that turns raw FullAnalysisDataset into
 * LLM-ready temporal context structures.
 *
 * NO database access – operates on in-memory data from analysisAccess.ts.
 * NO filtering – all events remain visible, including low-confidence ones.
 * NO trigger assertions – only preparatory context, never medical truth.
 *
 * === KEY CONCEPTS ===
 *
 *   TimelineItem     – unified chronological item (voice event OR pain entry OR med intake)
 *   DayContext       – all items for one calendar day, pre-grouped
 *   ContextWindow    – items within a time window around a focal event
 *   PhaseBlock       – consecutive items sharing a state (rest, exertion, pain, ...)
 *
 * The LLM receives DayContext[] with enriched items – not raw DB rows.
 */

import type {
  VoiceEventForAnalysis,
  PainEntryForAnalysis,
  MedicationIntakeForAnalysis,
  FullAnalysisDataset,
} from './analysisAccess';

// ============================================================
// === TYPES ===
// ============================================================

export type TimelineItemKind = 'voice' | 'pain_entry' | 'med_intake';

/**
 * Unified timeline item – one row on the chronological axis.
 * Contains the original data plus derived helpers for LLM consumption.
 */
export interface TimelineItem {
  /** Unique ID (voice event id, pain entry id, or intake id) */
  id: string;
  kind: TimelineItemKind;
  /** ISO timestamp used for sorting (event_timestamp for voice, selected_date+time for entries) */
  timestamp: string;
  /** Calendar date YYYY-MM-DD */
  date: string;
  /** HH:MM or null */
  time: string | null;
  /** Human-readable text for LLM prompt (raw_transcript, notes, or med name) */
  displayText: string;
  /** Semantic tags for quick filtering (e.g. ['pain','medication','mecfs_state']) */
  semanticTags: string[];
  /** Link to related items (e.g. voice event → pain entry) */
  linkedIds: string[];
  /** Original source data (typed union kept opaque for flexibility) */
  source:
    | { type: 'voice'; data: VoiceEventForAnalysis }
    | { type: 'pain_entry'; data: PainEntryForAnalysis }
    | { type: 'med_intake'; data: MedicationIntakeForAnalysis };
}

/**
 * All items for a single calendar day, enriched with day-level summaries.
 */
export interface DayContext {
  date: string; // YYYY-MM-DD
  items: TimelineItem[];
  /** Max pain level observed this day (0 if none) */
  maxPainLevel: number;
  /** Whether ME/CFS signals were present */
  hasMecfsSignals: boolean;
  /** Whether medication was taken */
  hasMedication: boolean;
  /** Number of voice events */
  voiceEventCount: number;
  /** Number of structured entries */
  structuredEntryCount: number;
  /** Detected phase blocks within the day */
  phases: PhaseBlock[];
}

/**
 * A consecutive group of timeline items sharing a dominant state.
 * Not medical truth – a preparatory clustering for analysis.
 */
export interface PhaseBlock {
  state: PhaseState;
  items: TimelineItem[];
  startTime: string | null;
  endTime: string | null;
}

export type PhaseState =
  | 'rest'
  | 'exertion'
  | 'pain'
  | 'fatigue'
  | 'medication'
  | 'environment'
  | 'food_drink'
  | 'wellbeing'
  | 'observation';

/**
 * Items within a time window around a focal event.
 */
export interface ContextWindow {
  /** The focal event */
  focal: TimelineItem;
  /** Events before the focal event (ordered oldest → newest) */
  preceding: TimelineItem[];
  /** Events after the focal event (ordered oldest → newest) */
  following: TimelineItem[];
  /** Window size in hours */
  windowHours: number;
}

/**
 * Items grouped by session_id (for voice events that share a recording session).
 */
export interface SessionBlock {
  sessionId: string;
  items: TimelineItem[];
  startTime: string;
  endTime: string;
}

/**
 * A recurring pattern observed across multiple days.
 * NOT a medical assertion – just a structural observation for LLM input.
 */
export interface RecurringSequence {
  /** Human-readable label (e.g. "exertion → fatigue") */
  pattern: string;
  /** Phase transitions observed (e.g. ['exertion','fatigue','rest']) */
  phaseSequence: PhaseState[];
  /** Dates where this sequence occurred */
  occurrenceDates: string[];
  /** How many times observed */
  count: number;
}

/**
 * Complete LLM-ready analysis context for a date range.
 */
export interface AnalysisContext {
  days: DayContext[];
  /** Full chronological timeline across all days */
  timeline: TimelineItem[];
  /** Items grouped by voice recording session */
  sessions: SessionBlock[];
  /** Pain-centric context windows */
  painWindows: ContextWindow[];
  /** Fatigue/PEM-centric context windows */
  fatigueWindows: ContextWindow[];
  /** Medication-centric context windows */
  medicationWindows: ContextWindow[];
  /** Recurring phase sequences across days */
  recurringSequences: RecurringSequence[];
  meta: {
    totalItems: number;
    totalDays: number;
    daysWithPain: number;
    daysWithMecfs: number;
    daysWithMedication: number;
    sessionCount: number;
  };
}

// ============================================================
// === TIMELINE CONSTRUCTION ===
// ============================================================

const PAIN_LEVEL_MAP: Record<string, number> = {
  leicht: 2, mittel: 5, stark: 7, sehr_stark: 9,
};

function parsePainLevel(level: string): number {
  if (!level || level === '-' || level === 'none') return 0;
  const mapped = PAIN_LEVEL_MAP[level];
  if (mapped !== undefined) return mapped;
  const num = parseInt(level, 10);
  return Number.isFinite(num) ? num : 0;
}

function entryTimestamp(e: PainEntryForAnalysis): string {
  if (e.selected_date && e.selected_time) {
    return `${e.selected_date}T${e.selected_time}`;
  }
  if (e.selected_date) return `${e.selected_date}T12:00:00`;
  return e.timestamp_created ?? '1970-01-01T00:00:00';
}

function entryDate(e: PainEntryForAnalysis): string {
  return e.selected_date ?? (e.timestamp_created?.slice(0, 10) ?? '1970-01-01');
}

function intakeTimestamp(i: MedicationIntakeForAnalysis): string {
  if (i.taken_date && i.taken_time) return `${i.taken_date}T${i.taken_time}`;
  if (i.taken_date) return `${i.taken_date}T12:00:00`;
  return '1970-01-01T00:00:00';
}

function voiceSemanticTags(v: VoiceEventForAnalysis): string[] {
  const tags = [...v.event_types];
  if (v.tags?.length) tags.push(...v.tags);
  if (v.medical_relevance && v.medical_relevance !== 'none') {
    tags.push(`relevance:${v.medical_relevance}`);
  }
  // ME/CFS from structured_data
  const sd = v.structured_data as Record<string, unknown> | null;
  if (sd?.mecfsSignals) tags.push('mecfs_signal');
  return [...new Set(tags)];
}

function painEntrySemanticTags(e: PainEntryForAnalysis): string[] {
  const tags: string[] = [`entry_kind:${e.entry_kind}`];
  const pl = parsePainLevel(e.pain_level);
  if (pl > 0) tags.push('pain');
  if (pl >= 7) tags.push('severe_pain');
  if (e.aura_type && e.aura_type !== 'keine') tags.push('aura');
  if (e.medications?.length) tags.push('medication');
  if (e.me_cfs_severity_level && e.me_cfs_severity_level !== 'none') {
    tags.push('mecfs_signal', `mecfs:${e.me_cfs_severity_level}`);
  }
  return tags;
}

/**
 * Build a unified, chronologically sorted timeline from the raw dataset.
 */
export function buildTimeline(dataset: FullAnalysisDataset): TimelineItem[] {
  const items: TimelineItem[] = [];

  // Voice events
  for (const v of dataset.voiceEvents) {
    items.push({
      id: v.id,
      kind: 'voice',
      timestamp: v.event_timestamp,
      date: v.event_timestamp.slice(0, 10),
      time: v.event_timestamp.slice(11, 16) || null,
      displayText: v.raw_transcript,
      semanticTags: voiceSemanticTags(v),
      linkedIds: v.related_entry_id !== null ? [String(v.related_entry_id)] : [],
      source: { type: 'voice', data: v },
    });
  }

  // Pain entries
  for (const e of dataset.painEntries) {
    items.push({
      id: String(e.id),
      kind: 'pain_entry',
      timestamp: entryTimestamp(e),
      date: entryDate(e),
      time: e.selected_time ?? null,
      displayText: e.notes ?? `Eintrag: ${e.pain_level}`,
      semanticTags: painEntrySemanticTags(e),
      linkedIds: e.voice_note_id ? [e.voice_note_id] : [],
      source: { type: 'pain_entry', data: e },
    });
  }

  // Medication intakes
  for (const i of dataset.medicationIntakes) {
    items.push({
      id: i.id,
      kind: 'med_intake',
      timestamp: intakeTimestamp(i),
      date: i.taken_date ?? '1970-01-01',
      time: i.taken_time ?? null,
      displayText: `${i.medication_name} (${i.dose_quarters / 4} Einheit${i.dose_quarters !== 4 ? 'en' : ''})`,
      semanticTags: ['medication', 'intake'],
      linkedIds: [String(i.entry_id)],
      source: { type: 'med_intake', data: i },
    });
  }

  // Sort chronologically by timestamp
  items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return items;
}

// ============================================================
// === DAY GROUPING ===
// ============================================================

/**
 * Group timeline items by calendar day and compute day-level summaries.
 */
export function buildDayContexts(timeline: TimelineItem[]): DayContext[] {
  const byDate = new Map<string, TimelineItem[]>();

  for (const item of timeline) {
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date)!.push(item);
  }

  const days: DayContext[] = [];

  for (const [date, items] of byDate) {
    let maxPainLevel = 0;
    let hasMecfsSignals = false;
    let hasMedication = false;
    let voiceEventCount = 0;
    let structuredEntryCount = 0;

    for (const item of items) {
      if (item.kind === 'voice') voiceEventCount++;
      if (item.kind === 'pain_entry') {
        structuredEntryCount++;
        const pl = parsePainLevel((item.source.data as PainEntryForAnalysis).pain_level);
        if (pl > maxPainLevel) maxPainLevel = pl;
      }
      if (item.semanticTags.some(t => t === 'mecfs_signal' || t === 'mecfs_state')) hasMecfsSignals = true;
      if (item.semanticTags.includes('medication') || item.kind === 'med_intake') {
        hasMedication = true;
      }
    }

    const phases = detectPhaseBlocks(items);

    days.push({
      date,
      items,
      maxPainLevel,
      hasMecfsSignals,
      hasMedication,
      voiceEventCount,
      structuredEntryCount,
      phases,
    });
  }

  // Sort days ascending (chronological)
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

// ============================================================
// === PHASE BLOCKS ===
// ============================================================

/**
 * Infer the dominant phase state for a timeline item.
 * This is a soft heuristic, not a medical classification.
 */
function inferItemPhase(item: TimelineItem): PhaseState {
  const tags = item.semanticTags;

  if (tags.includes('pain') || tags.includes('severe_pain')) return 'pain';
  if (tags.includes('mecfs_signal') || tags.includes('mecfs_state')) return 'fatigue';
  if (item.kind === 'med_intake' || tags.includes('medication')) return 'medication';

  // Voice-specific: check event_types
  if (item.kind === 'voice') {
    const types = (item.source.data as VoiceEventForAnalysis).event_types;
    if (types.includes('sleep_rest')) return 'rest';
    if (types.includes('activity')) return 'exertion';
    if (types.includes('environment')) return 'environment';
    if (types.includes('food_drink')) return 'food_drink';
    if (types.includes('wellbeing')) return 'wellbeing';
  }

  return 'observation';
}

/**
 * Group consecutive items with the same phase state into blocks.
 * Adjacent items with different states start a new block.
 */
export function detectPhaseBlocks(items: TimelineItem[]): PhaseBlock[] {
  if (items.length === 0) return [];

  const blocks: PhaseBlock[] = [];
  let current: PhaseBlock = {
    state: inferItemPhase(items[0]),
    items: [items[0]],
    startTime: items[0].time,
    endTime: items[0].time,
  };

  for (let i = 1; i < items.length; i++) {
    const phase = inferItemPhase(items[i]);
    if (phase === current.state) {
      current.items.push(items[i]);
      current.endTime = items[i].time;
    } else {
      blocks.push(current);
      current = {
        state: phase,
        items: [items[i]],
        startTime: items[i].time,
        endTime: items[i].time,
      };
    }
  }
  blocks.push(current);
  return blocks;
}

// ============================================================
// === CONTEXT WINDOWS ===
// ============================================================

/**
 * Build a context window around a focal item.
 * Extracts all timeline items within ±windowHours of the focal event.
 */
export function buildContextWindow(
  focal: TimelineItem,
  timeline: TimelineItem[],
  windowHours: number,
): ContextWindow {
  const focalMs = new Date(focal.timestamp).getTime();
  const windowMs = windowHours * 3600_000;

  const preceding: TimelineItem[] = [];
  const following: TimelineItem[] = [];

  for (const item of timeline) {
    if (item.id === focal.id) continue;
    const itemMs = new Date(item.timestamp).getTime();
    const diff = itemMs - focalMs;
    if (diff < 0 && Math.abs(diff) <= windowMs) {
      preceding.push(item);
    } else if (diff > 0 && diff <= windowMs) {
      following.push(item);
    }
  }

  return { focal, preceding, following, windowHours };
}

/**
 * Build context windows around all items matching a predicate.
 */
export function buildContextWindows(
  timeline: TimelineItem[],
  predicate: (item: TimelineItem) => boolean,
  windowHours = 6,
): ContextWindow[] {
  return timeline
    .filter(predicate)
    .map(focal => buildContextWindow(focal, timeline, windowHours));
}

// ============================================================
// === SESSION GROUPING ===
// ============================================================

/**
 * Group voice timeline items by session_id.
 * Non-voice items and items without session_id are excluded.
 */
export function buildSessionBlocks(timeline: TimelineItem[]): SessionBlock[] {
  const bySession = new Map<string, TimelineItem[]>();

  for (const item of timeline) {
    if (item.kind !== 'voice') continue;
    const sid = (item.source.data as VoiceEventForAnalysis).session_id;
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid)!.push(item);
  }

  const blocks: SessionBlock[] = [];
  for (const [sessionId, items] of bySession) {
    if (items.length === 0) continue;
    blocks.push({
      sessionId,
      items,
      startTime: items[0].timestamp,
      endTime: items[items.length - 1].timestamp,
    });
  }

  blocks.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return blocks;
}

// ============================================================
// === RECURRING SEQUENCES ===
// ============================================================

/**
 * Detect recurring phase transition patterns across days.
 * Returns sequences that appear on 2+ days.
 *
 * Example: if "exertion → fatigue → rest" appears on 3 days,
 * it's returned as a RecurringSequence with count=3.
 */
export function detectRecurringSequences(days: DayContext[]): RecurringSequence[] {
  const signatureMap = new Map<string, { seq: PhaseState[]; dates: string[] }>();

  for (const day of days) {
    if (day.phases.length < 2) continue;
    // Build all length-2 and length-3 sub-sequences
    for (let len = 2; len <= Math.min(day.phases.length, 3); len++) {
      for (let i = 0; i <= day.phases.length - len; i++) {
        const seq = day.phases.slice(i, i + len).map(p => p.state);
        const key = seq.join('→');
        if (!signatureMap.has(key)) signatureMap.set(key, { seq, dates: [] });
        const entry = signatureMap.get(key)!;
        if (!entry.dates.includes(day.date)) entry.dates.push(day.date);
      }
    }
  }

  const results: RecurringSequence[] = [];
  for (const [pattern, { seq, dates }] of signatureMap) {
    if (dates.length >= 2) {
      results.push({ pattern, phaseSequence: seq, occurrenceDates: dates, count: dates.length });
    }
  }

  results.sort((a, b) => b.count - a.count);
  return results;
}

// ============================================================
// === LLM PROMPT SERIALIZER ===
// ============================================================

/**
 * Serialize an AnalysisContext into a structured, human-readable text
 * suitable for inclusion in an LLM prompt.
 *
 * Design: readable by both humans and LLMs; no internal IDs exposed;
 * raw transcripts preserved; review status clearly marked.
 */
export function serializeForLLM(ctx: AnalysisContext): string {
  const lines: string[] = [];

  lines.push(`=== Verlaufsdaten (${ctx.meta.totalDays} Tage, ${ctx.meta.totalItems} Ereignisse) ===`);
  lines.push('');

  for (const day of ctx.days) {
    lines.push(`--- ${day.date} ---`);
    if (day.maxPainLevel > 0) lines.push(`  Max. Schmerz: ${day.maxPainLevel}/10`);
    if (day.hasMecfsSignals) lines.push(`  ME/CFS-Signale vorhanden`);
    if (day.hasMedication) lines.push(`  Medikation eingenommen`);
    lines.push('');

    for (const item of day.items) {
      const timeStr = item.time ? `[${item.time}]` : '[--:--]';
      const kindLabel = item.kind === 'voice' ? 'Sprache'
        : item.kind === 'pain_entry' ? 'Eintrag'
        : 'Medikament';

      let line = `  ${timeStr} (${kindLabel}) ${item.displayText}`;

      // Add review state for voice events
      if (item.kind === 'voice') {
        const v = item.source.data as VoiceEventForAnalysis;
        if (v.review_state === 'edited') line += ' [bearbeitet]';
        else if (v.review_state === 'reviewed') line += ' [bestätigt]';
        if (v.related_entry_id !== null) line += ` → Eintrag #${v.related_entry_id}`;
      }

      // Add pain details for entries
      if (item.kind === 'pain_entry') {
        const e = item.source.data as PainEntryForAnalysis;
        const parts: string[] = [];
        if (e.pain_level && e.pain_level !== '-') parts.push(`NRS ${e.pain_level}`);
        if (e.pain_locations?.length) parts.push(`Ort: ${e.pain_locations.join(', ')}`);
        if (e.aura_type && e.aura_type !== 'keine') parts.push(`Aura: ${e.aura_type}`);
        if (e.medications?.length) parts.push(`Medikation: ${e.medications.join(', ')}`);
        if (e.me_cfs_severity_level && e.me_cfs_severity_level !== 'none') {
          parts.push(`ME/CFS: ${e.me_cfs_severity_level}`);
        }
        if (parts.length) line += ` (${parts.join('; ')})`;
      }

      lines.push(line);
    }

    // Phase summary
    if (day.phases.length > 1) {
      const phaseStr = day.phases.map(p => p.state).join(' → ');
      lines.push(`  Phasen: ${phaseStr}`);
    }
    lines.push('');
  }

  // Recurring patterns
  if (ctx.recurringSequences.length > 0) {
    lines.push('=== Wiederkehrende Muster ===');
    for (const seq of ctx.recurringSequences.slice(0, 5)) {
      lines.push(`  ${seq.pattern} (${seq.count}× an Tagen: ${seq.occurrenceDates.join(', ')})`);
    }
    lines.push('');
  }

  // Context windows summary
  if (ctx.painWindows.length > 0) {
    lines.push(`=== Schmerz-Kontextfenster (${ctx.painWindows.length}) ===`);
    for (const w of ctx.painWindows.slice(0, 3)) {
      lines.push(`  Schmerzereignis: ${w.focal.displayText} [${w.focal.time ?? '--:--'}]`);
      if (w.preceding.length) {
        lines.push(`    Vorher (${w.windowHours}h): ${w.preceding.map(p => p.displayText).join(' | ')}`);
      }
      if (w.following.length) {
        lines.push(`    Nachher (${w.windowHours}h): ${w.following.map(f => f.displayText).join(' | ')}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// === MAIN ENTRY POINT ===
// ============================================================

/**
 * Transform a FullAnalysisDataset into a complete LLM-ready AnalysisContext.
 *
 * @param dataset – raw data from getAnalysisDataset()
 * @param windowHours – hours before/after focal events to include (default: 6)
 */
export function buildAnalysisContext(
  dataset: FullAnalysisDataset,
  windowHours = 6,
): AnalysisContext {
  const timeline = buildTimeline(dataset);
  const days = buildDayContexts(timeline);
  const sessions = buildSessionBlocks(timeline);
  const recurringSequences = detectRecurringSequences(days);

  const painWindows = buildContextWindows(
    timeline,
    item => item.semanticTags.includes('pain') || item.semanticTags.includes('severe_pain'),
    windowHours,
  );

  const fatigueWindows = buildContextWindows(
    timeline,
    item => item.semanticTags.includes('mecfs_signal') || item.semanticTags.includes('mecfs_state'),
    windowHours,
  );

  const medicationWindows = buildContextWindows(
    timeline,
    item => item.kind === 'med_intake',
    windowHours,
  );

  return {
    days,
    timeline,
    sessions,
    painWindows,
    fatigueWindows,
    medicationWindows,
    recurringSequences,
    meta: {
      totalItems: timeline.length,
      totalDays: days.length,
      daysWithPain: days.filter(d => d.maxPainLevel > 0).length,
      daysWithMecfs: days.filter(d => d.hasMecfsSignals).length,
      daysWithMedication: days.filter(d => d.hasMedication).length,
      sessionCount: sessions.length,
    },
  };
}
