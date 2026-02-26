/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CgrpDoseResolver — Resolves dose events from multiple evidence sources
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Core guarantees:
 * 1. If ANY evidence exists for a drug, at least 1 DoseEvent is returned.
 * 2. Multiple evidences within ±2 days are clustered into 1 event.
 * 3. P1 (diary entry) always wins the canonical date within a cluster.
 * 4. Confidence is derived from score bands, never hardcoded.
 * 5. No silent null returns — fallback logic ensures "always a date if documented".
 */

import type {
  DoseEvent,
  DoseEvidence,
  DoseConfidence,
  EvidenceSource,
  ResolverInput,
} from './types';
import { diffBerlinDays, isInRange } from './dateKeyHelpers';
import { textContainsDrug, textContainsContext, CGRP_DRUG_REGISTRY } from './drugRegistry';

// ─── Score Constants ────────────────────────────────────────────────────

const BASE_SCORES: Record<EvidenceSource, number> = {
  diary_medication_entry: 100,
  reminder_completed: 85,
  diary_free_text: 70,
  reminder_scheduled: 50,
  inferred_from_pattern: 30,
};

const MODIFIER_TIMESTAMP_PRESENT = 10;
const MODIFIER_COMPLETION_NEAR_SCHEDULE = 10;
const MODIFIER_COMPLETION_FAR_FROM_SCHEDULE = -15;
const MODIFIER_FREE_TEXT_NO_CONTEXT = -20;
const MODIFIER_SAME_DAY_ACTIVITY = 5;

const CLUSTER_RADIUS_DAYS = 2;

// ─── Source priority (lower = higher priority) ──────────────────────────

const SOURCE_PRIORITY: Record<EvidenceSource, number> = {
  diary_medication_entry: 0,
  reminder_completed: 1,
  diary_free_text: 2,
  reminder_scheduled: 3,
  inferred_from_pattern: 4,
};

// ─── Score to confidence mapping ────────────────────────────────────────

function scoreToConfidence(score: number): DoseConfidence {
  if (score >= 95) return 1.0;
  if (score >= 85) return 0.9;
  if (score >= 75) return 0.8;
  if (score >= 60) return 0.6;
  if (score >= 50) return 0.5;
  return 0.4;
}

// ─── Evidence Collection ────────────────────────────────────────────────

function collectEvidences(input: ResolverInput): DoseEvidence[] {
  const { drug, drugNames, diaryEntries, medicationIntakes, reminders, reminderCompletions, timeRangeStartBerlin, timeRangeEndBerlin } = input;
  const evidences: DoseEvidence[] = [];
  const drugNamesLower = drugNames.map(n => n.toLowerCase());

  // Find context keywords for this drug
  const profile = CGRP_DRUG_REGISTRY.find(p => p.drug === drug);
  const contextKeywords = profile?.contextKeywords ?? [];

  // Collect diary dates with activity (for same-day modifier)
  const diaryActivityDates = new Set(
    diaryEntries.map(e => e.dateKeyBerlin)
  );

  // P1: Diary medication entries (structured)
  for (const entry of diaryEntries) {
    if (!isInRange(entry.dateKeyBerlin, timeRangeStartBerlin, timeRangeEndBerlin)) continue;

    const hasDrug = entry.medicationNames.some(name =>
      drugNamesLower.some(dn => name.toLowerCase().includes(dn) || dn.includes(name.toLowerCase()))
    );
    if (!hasDrug) continue;

    let score = BASE_SCORES.diary_medication_entry;
    if (entry.timestampUtc && isValidTimestamp(entry.timestampUtc)) {
      score += MODIFIER_TIMESTAMP_PRESENT;
    }

    evidences.push({
      source: 'diary_medication_entry',
      rawId: String(entry.entryId),
      timestampUtc: entry.timestampUtc,
      dateKeyBerlin: entry.dateKeyBerlin,
      score,
    });
  }

  // P1b: Medication intakes (explicit intake records)
  for (const intake of medicationIntakes) {
    if (!isInRange(intake.dateKeyBerlin, timeRangeStartBerlin, timeRangeEndBerlin)) continue;

    const hasDrug = drugNamesLower.some(dn =>
      intake.medicationName.toLowerCase().includes(dn) || dn.includes(intake.medicationName.toLowerCase())
    );
    if (!hasDrug) continue;

    let score = BASE_SCORES.diary_medication_entry; // same priority as diary
    if (intake.timestampUtc && isValidTimestamp(intake.timestampUtc)) {
      score += MODIFIER_TIMESTAMP_PRESENT;
    }

    evidences.push({
      source: 'diary_medication_entry',
      rawId: intake.id,
      timestampUtc: intake.timestampUtc,
      dateKeyBerlin: intake.dateKeyBerlin,
      score,
    });
  }

  // Build reminder lookup for completion matching
  const reminderMap = new Map(reminders.map(r => [r.id, r]));

  // P2: Reminder completions
  for (const completion of reminderCompletions) {
    if (!isInRange(completion.completedDateKeyBerlin, timeRangeStartBerlin, timeRangeEndBerlin)) continue;

    const reminder = reminderMap.get(completion.reminderId);
    if (!reminder) continue;

    // Check if reminder is for this drug
    const reminderHasDrug =
      textContainsDrug(reminder.title, drugNamesLower) ||
      reminder.medications.some(m => drugNamesLower.some(dn =>
        m.toLowerCase().includes(dn) || dn.includes(m.toLowerCase())
      ));
    if (!reminderHasDrug) continue;

    let score = BASE_SCORES.reminder_completed;

    // Timestamp present modifier
    if (completion.completedTimestampUtc && isValidTimestamp(completion.completedTimestampUtc)) {
      score += MODIFIER_TIMESTAMP_PRESENT;
    }

    // Check proximity to scheduled date
    if (reminder.scheduledDateKeyBerlin) {
      const daysDiff = Math.abs(diffBerlinDays(reminder.scheduledDateKeyBerlin, completion.completedDateKeyBerlin));
      if (daysDiff <= 1) {
        score += MODIFIER_COMPLETION_NEAR_SCHEDULE;
      } else if (daysDiff > 3) {
        score += MODIFIER_COMPLETION_FAR_FROM_SCHEDULE;
      }
    }

    // Same-day activity modifier
    if (diaryActivityDates.has(completion.completedDateKeyBerlin)) {
      score += MODIFIER_SAME_DAY_ACTIVITY;
    }

    evidences.push({
      source: 'reminder_completed',
      rawId: completion.reminderId,
      timestampUtc: completion.completedTimestampUtc,
      dateKeyBerlin: completion.completedDateKeyBerlin,
      score,
    });
  }

  // P3: Diary free text (notes containing drug name)
  for (const entry of diaryEntries) {
    if (!isInRange(entry.dateKeyBerlin, timeRangeStartBerlin, timeRangeEndBerlin)) continue;
    if (!entry.notes) continue;

    if (!textContainsDrug(entry.notes, drugNamesLower)) continue;

    // Skip if already matched as structured med entry for this date
    const alreadyHasP1 = evidences.some(
      e => e.source === 'diary_medication_entry' && e.dateKeyBerlin === entry.dateKeyBerlin
    );
    if (alreadyHasP1) continue;

    let score = BASE_SCORES.diary_free_text;

    // Check for context keywords (e.g., "gespritzt", "injiziert")
    if (textContainsContext(entry.notes, contextKeywords)) {
      // Good context — no penalty
    } else {
      score += MODIFIER_FREE_TEXT_NO_CONTEXT;
    }

    if (entry.timestampUtc && isValidTimestamp(entry.timestampUtc)) {
      score += MODIFIER_TIMESTAMP_PRESENT;
    }

    evidences.push({
      source: 'diary_free_text',
      rawId: String(entry.entryId),
      timestampUtc: entry.timestampUtc,
      dateKeyBerlin: entry.dateKeyBerlin,
      score,
      notes: `Free text match in notes`,
    });
  }

  // P4: Scheduled reminders (fallback — no completion)
  for (const reminder of reminders) {
    if (!isInRange(reminder.scheduledDateKeyBerlin, timeRangeStartBerlin, timeRangeEndBerlin)) continue;

    const reminderHasDrug =
      textContainsDrug(reminder.title, drugNamesLower) ||
      reminder.medications.some(m => drugNamesLower.some(dn =>
        m.toLowerCase().includes(dn) || dn.includes(m.toLowerCase())
      ));
    if (!reminderHasDrug) continue;

    // Skip if there's already a completion for this reminder
    const hasCompletion = reminderCompletions.some(c => c.reminderId === reminder.id);
    if (hasCompletion) continue;

    let score = BASE_SCORES.reminder_scheduled;

    if (reminder.scheduledTimestampUtc && isValidTimestamp(reminder.scheduledTimestampUtc)) {
      score += MODIFIER_TIMESTAMP_PRESENT;
    }

    evidences.push({
      source: 'reminder_scheduled',
      rawId: reminder.id,
      timestampUtc: reminder.scheduledTimestampUtc,
      dateKeyBerlin: reminder.scheduledDateKeyBerlin,
      score,
      notes: 'Scheduled only, not confirmed',
    });
  }

  return evidences;
}

// ─── Clustering ─────────────────────────────────────────────────────────

interface EvidenceCluster {
  evidences: DoseEvidence[];
  canonicalDateKey: string;
}

function clusterEvidences(evidences: DoseEvidence[]): EvidenceCluster[] {
  if (evidences.length === 0) return [];

  // Sort by dateKey, then by score descending
  const sorted = [...evidences].sort((a, b) => {
    const dateCompare = a.dateKeyBerlin.localeCompare(b.dateKeyBerlin);
    if (dateCompare !== 0) return dateCompare;
    return b.score - a.score;
  });

  const clusters: EvidenceCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;

    const cluster: DoseEvidence[] = [sorted[i]];
    used.add(i);

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      const daysDiff = Math.abs(diffBerlinDays(sorted[i].dateKeyBerlin, sorted[j].dateKeyBerlin));
      if (daysDiff <= CLUSTER_RADIUS_DAYS) {
        cluster.push(sorted[j]);
        used.add(j);
      }
    }

    // Determine canonical date: P1 always wins, otherwise best score
    const p1Evidence = cluster.find(e => e.source === 'diary_medication_entry');
    const bestEvidence = cluster.reduce((best, e) => e.score > best.score ? e : best, cluster[0]);
    const canonicalDateKey = p1Evidence?.dateKeyBerlin ?? bestEvidence.dateKeyBerlin;

    clusters.push({ evidences: cluster, canonicalDateKey });
  }

  return clusters;
}

// ─── Main Resolver ──────────────────────────────────────────────────────

export function resolveDoseEvents(input: ResolverInput): DoseEvent[] {
  const evidences = collectEvidences(input);

  if (evidences.length === 0) {
    return [];
  }

  const clusters = clusterEvidences(evidences);

  // Fallback: if clustering somehow produces 0 clusters but evidences exist
  if (clusters.length === 0 && evidences.length > 0) {
    const best = evidences.reduce((a, b) => a.score > b.score ? a : b);
    return [{
      drug: input.drug,
      dateKeyBerlin: best.dateKeyBerlin,
      confidence: scoreToConfidence(best.score),
      primarySource: best.source,
      evidences: [best],
    }];
  }

  return clusters.map(cluster => {
    const bestEvidence = cluster.evidences.reduce((best, e) => {
      // Use source priority as tiebreaker
      if (e.score > best.score) return e;
      if (e.score === best.score && SOURCE_PRIORITY[e.source] < SOURCE_PRIORITY[best.source]) return e;
      return best;
    }, cluster.evidences[0]);

    const aggregateScore = Math.max(...cluster.evidences.map(e => e.score));

    // Extract time label from best evidence with timestamp
    const evidenceWithTimestamp = cluster.evidences.find(e =>
      e.timestampUtc && isValidTimestamp(e.timestampUtc)
    );
    let timeLabelBerlin: string | undefined;
    if (evidenceWithTimestamp?.timestampUtc) {
      try {
        const d = new Date(evidenceWithTimestamp.timestampUtc);
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Berlin',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(d);
        const hour = parts.find(p => p.type === 'hour')?.value ?? '';
        const minute = parts.find(p => p.type === 'minute')?.value ?? '';
        if (hour && minute) timeLabelBerlin = `${hour}:${minute}`;
      } catch {
        // ignore
      }
    }

    return {
      drug: input.drug,
      dateKeyBerlin: cluster.canonicalDateKey,
      timeLabelBerlin,
      confidence: scoreToConfidence(aggregateScore),
      primarySource: bestEvidence.source,
      evidences: cluster.evidences,
    };
  }).sort((a, b) => a.dateKeyBerlin.localeCompare(b.dateKeyBerlin));
}

// ─── Helpers ────────────────────────────────────────────────────────────

function isValidTimestamp(ts: string): boolean {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return false;
    // Not in the far future (>1 day from now)
    if (d.getTime() > Date.now() + 86400000) return false;
    // Not epoch (1970)
    if (d.getFullYear() < 2000) return false;
    return true;
  } catch {
    return false;
  }
}
