/**
 * serverAnalysisDataset.ts
 *
 * Server-side dataset builder for the shared (doctor) AI analysis flow.
 *
 * IMPORTANT:
 * - Reads only data for ONE explicit ownerUserId — service role MUST always filter.
 * - Read-only. No writes.
 * - Returns a serialized LLM-ready string + meta — no PHI/health data is logged.
 *
 * This is a SIMPLIFIED port of the App-side pipeline (analysisAccess.ts +
 * analysisContext.ts). It is good enough for first-time on-demand analyses
 * triggered from the doctor view. The richer App-side pipeline (windowing,
 * recurring sequences, ME/CFS phases) is intentionally NOT duplicated here
 * to keep the server attack surface small.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface ServerDatasetMeta {
  totalDays: number;
  voiceEventCount: number;
  painEntryCount: number;
  medicationIntakeCount: number;
  daysWithPain: number;
  daysWithMecfs: number;
}

export interface ServerDataset {
  serialized: string;
  meta: ServerDatasetMeta;
  fromDate: string;
  toDate: string;
  /** Raw rows surfaced so server-side PreAnalysis / V2.1 findings builders
   *  don't need to re-query the database. Owner-scoped, privacy-filtered
   *  at the source query above. */
  raw: {
    painEntries: PainEntryRow[];
    medIntakes: MedicationIntakeRow[];
    medEffects: MedicationEffectRow[];
    contextNoteCount: number;
  };
}

export interface MedicationEffectRow {
  id: string;
  entry_id: number;
  med_name: string;
  effect_score: number | null;
  effect_rating: string | null;
}


interface VoiceEventRow {
  id: string;
  event_timestamp: string | null;
  created_at: string;
  cleaned_transcript: string | null;
  raw_transcript: string | null;
  event_types: string[] | null;
  tags: string[] | null;
  medical_relevance: string | null;
}
interface PainEntryRow {
  id: number;
  selected_date: string | null;
  selected_time: string | null;
  timestamp_created: string;
  pain_level: string | null;
  pain_locations: string[] | null;
  aura_type: string | null;
  medications: string[] | null;
  notes: string | null;
  entry_note_is_private: boolean | null;
  me_cfs_severity_level: string | null;
  me_cfs_severity_score: number | null;
}
interface MedicationIntakeRow {
  id: string;
  taken_date: string | null;
  taken_time: string | null;
  taken_at: string | null;
  medication_name: string;
  dose_quarters: number | null;
}

const PAIN_LEVEL_NUM: Record<string, number> = {
  '-': 0, 'leicht': 2, 'mittel': 5, 'stark': 7, 'sehr_stark': 9,
};

function dayKey(dateLike: string | null | undefined): string | null {
  if (!dateLike) return null;
  return dateLike.slice(0, 10);
}

function painNum(level: string | null): number {
  if (!level) return 0;
  if (/^\d+$/.test(level)) return parseInt(level, 10);
  return PAIN_LEVEL_NUM[level] ?? 0;
}

export async function buildServerAnalysisDataset(
  supabase: SupabaseClient,
  ownerUserId: string,
  fromDate: string, // YYYY-MM-DD
  toDate: string,   // YYYY-MM-DD
): Promise<ServerDataset> {
  const fromIso = `${fromDate}T00:00:00Z`;
  const toIso = `${toDate}T23:59:59Z`;

  // === FETCH (always filtered by ownerUserId) ===
  const [voiceRes, painRes, medRes, ctxRes] = await Promise.all([
    supabase
      .from('voice_events')
      .select('id,event_timestamp,created_at,cleaned_transcript,raw_transcript,event_types,tags,medical_relevance')
      .eq('user_id', ownerUserId)
      .gte('event_timestamp', fromIso)
      .lte('event_timestamp', toIso)
      .order('event_timestamp', { ascending: true })
      .limit(2000),
    supabase
      .from('pain_entries')
      .select('id,selected_date,selected_time,timestamp_created,pain_level,pain_locations,aura_type,medications,notes,entry_note_is_private,me_cfs_severity_level,me_cfs_severity_score')
      .eq('user_id', ownerUserId)
      .gte('selected_date', fromDate)
      .lte('selected_date', toDate)
      .order('selected_date', { ascending: true })
      .limit(2000),
    supabase
      .from('medication_intakes')
      .select('id,taken_date,taken_time,taken_at,medication_name,dose_quarters')
      .eq('user_id', ownerUserId)
      .gte('taken_date', fromDate)
      .lte('taken_date', toDate)
      .order('taken_date', { ascending: true })
      .limit(4000),
    // Tageszustand: structured fields only — NEVER text/notes (privacy)
    supabase
      .from('voice_notes')
      .select('occurred_at,context_type,metadata')
      .eq('user_id', ownerUserId)
      .eq('context_type', 'tageszustand')
      .is('deleted_at', null)
      .gte('occurred_at', fromIso)
      .lte('occurred_at', toIso)
      .order('occurred_at', { ascending: true })
      .limit(500),
  ]);

  const voiceEvents = (voiceRes.data ?? []) as VoiceEventRow[];
  const painEntries = (painRes.data ?? []) as PainEntryRow[];
  const medIntakes = (medRes.data ?? []) as MedicationIntakeRow[];
  const ctxNotes = (ctxRes.data ?? []) as Array<{
    occurred_at: string;
    context_type: string | null;
    metadata: Record<string, unknown> | null;
  }>;

  // === GROUP BY DAY ===
  const days = new Map<string, {
    voice: VoiceEventRow[];
    pain: PainEntryRow[];
    meds: MedicationIntakeRow[];
    factors: Array<{ mood: number|null; stress: number|null; sleep: number|null; energy: number|null; triggers: string[] }>;
  }>();

  function ensure(day: string) {
    if (!days.has(day)) days.set(day, { voice: [], pain: [], meds: [], factors: [] });
    return days.get(day)!;
  }

  for (const v of voiceEvents) {
    const k = dayKey(v.event_timestamp ?? v.created_at);
    if (k) ensure(k).voice.push(v);
  }
  for (const p of painEntries) {
    const k = dayKey(p.selected_date ?? p.timestamp_created);
    if (k) ensure(k).pain.push(p);
  }
  for (const m of medIntakes) {
    const k = dayKey(m.taken_date ?? m.taken_at);
    if (k) ensure(k).meds.push(m);
  }
  for (const c of ctxNotes) {
    const k = dayKey(c.occurred_at);
    if (!k) continue;
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    ensure(k).factors.push({
      mood: typeof meta.mood === 'number' ? meta.mood : null,
      stress: typeof meta.stress === 'number' ? meta.stress : null,
      sleep: typeof meta.sleep === 'number' ? meta.sleep : null,
      energy: typeof meta.energy === 'number' ? meta.energy : null,
      triggers: Array.isArray(meta.triggers) ? (meta.triggers as string[]) : [],
    });
  }

  let daysWithPain = 0;
  let daysWithMecfs = 0;

  // === SERIALIZE ===
  const sortedDays = Array.from(days.keys()).sort();
  const lines: string[] = [];
  lines.push(`# Verlaufsdaten ${fromDate} bis ${toDate}`);
  lines.push(`# Tage mit Daten: ${sortedDays.length}`);
  lines.push('');

  for (const day of sortedDays) {
    const d = days.get(day)!;
    const maxPain = d.pain.reduce((m, p) => Math.max(m, painNum(p.pain_level)), 0);
    if (maxPain >= 3) daysWithPain++;
    const mecfsScore = d.pain.reduce((m, p) => Math.max(m, p.me_cfs_severity_score ?? 0), 0);
    if (mecfsScore > 0) daysWithMecfs++;

    lines.push(`## ${day}`);
    if (d.pain.length > 0) {
      const auras = d.pain.map(p => p.aura_type).filter(a => a && a !== 'keine');
      const locs = Array.from(new Set(d.pain.flatMap(p => p.pain_locations ?? [])));
      lines.push(`- Schmerz: max ${maxPain}/10${locs.length ? `, Lokalisation: ${locs.join(', ')}` : ''}${auras.length ? `, Aura: ${auras.join(', ')}` : ''}`);
      // public notes only — never private
      const notes = d.pain
        .filter(p => !p.entry_note_is_private && p.notes && p.notes.trim().length > 0)
        .map(p => p.notes!.trim().slice(0, 200));
      if (notes.length > 0) {
        lines.push(`  Notiz: ${notes.join(' | ')}`);
      }
    }
    if (d.meds.length > 0) {
      const summary = new Map<string, number>();
      for (const m of d.meds) {
        const dose = (m.dose_quarters ?? 4) / 4;
        summary.set(m.medication_name, (summary.get(m.medication_name) ?? 0) + dose);
      }
      const parts = Array.from(summary.entries()).map(([n, d2]) => `${n} (${d2.toFixed(2)})`);
      lines.push(`- Medikamente: ${parts.join(', ')}`);
    }
    if (mecfsScore > 0) {
      lines.push(`- ME/CFS-Score: ${mecfsScore}`);
    }
    if (d.factors.length > 0) {
      // Tageszustand: structured fields only — no free-text notes (privacy)
      for (const f of d.factors) {
        const parts: string[] = [];
        if (f.mood !== null) parts.push(`Stimmung=${f.mood}/5`);
        if (f.stress !== null) parts.push(`Stress=${f.stress}/5`);
        if (f.sleep !== null) parts.push(`Schlaf=${f.sleep}/5`);
        if (f.energy !== null) parts.push(`Energie=${f.energy}/5`);
        if (f.triggers.length > 0) parts.push(`Auslöser: ${f.triggers.join(', ')}`);
        if (parts.length > 0) lines.push(`- Tagesfaktoren: ${parts.join(', ')}`);
      }
    }
    if (d.voice.length > 0) {
      // Max 5 transcripts per day, each truncated to 240 chars
      const slice = d.voice.slice(0, 5);
      for (const v of slice) {
        const t = (v.cleaned_transcript ?? v.raw_transcript ?? '').trim();
        if (!t) continue;
        const time = (v.event_timestamp ?? v.created_at).slice(11, 16);
        const tags = v.tags && v.tags.length > 0 ? ` [${v.tags.slice(0, 4).join(', ')}]` : '';
        lines.push(`- ${time}${tags}: ${t.slice(0, 240)}`);
      }
      if (d.voice.length > 5) {
        lines.push(`  (… ${d.voice.length - 5} weitere Sprachnotizen an diesem Tag)`);
      }
    }
    lines.push('');
  }

  const serialized = lines.join('\n');

  // total days in range (calendar)
  const fromMs = new Date(fromDate + 'T00:00:00Z').getTime();
  const toMs = new Date(toDate + 'T00:00:00Z').getTime();
  const totalDays = Math.max(1, Math.round((toMs - fromMs) / 86_400_000) + 1);

  const meta: ServerDatasetMeta = {
    totalDays,
    voiceEventCount: voiceEvents.length,
    painEntryCount: painEntries.length,
    medicationIntakeCount: medIntakes.length,
    daysWithPain,
    daysWithMecfs,
  };

  // Load actual medication_effects rows for the entries in range
  // (owner-scoped via entry_id filter; pain_entries are already owner-filtered).
  let medEffects: MedicationEffectRow[] = [];
  try {
    const entryIds = painEntries.map((p) => p.id);
    if (entryIds.length > 0) {
      const { data: effData } = await supabase
        .from("medication_effects")
        .select("id,entry_id,med_name,effect_score,effect_rating")
        .in("entry_id", entryIds);
      medEffects = (effData ?? []) as MedicationEffectRow[];
    }
  } catch (e) {
    console.warn("[serverAnalysisDataset] medication_effects fetch failed (non-fatal):", e);
  }

  return {
    serialized,
    meta,
    fromDate,
    toDate,
    raw: { painEntries, medIntakes, medEffects, contextNoteCount: ctxNotes.length },
  };
}

