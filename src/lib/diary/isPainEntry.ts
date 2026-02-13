/**
 * Determines whether a pain_entries record represents an actual pain/headache entry.
 * 
 * Non-pain entries (lifestyle, trigger, voice, note) must NOT count as pain days
 * in the pie chart / day classification logic.
 */

interface EntryLike {
  entry_kind?: string | null;
  pain_level?: string | number | null;
}

/**
 * Returns true only if the entry documents actual headache/migraine pain.
 * 
 * 1. If `entry_kind` is set → only 'pain' counts.
 * 2. Fallback (backward compat): pain_level exists and is not a "no pain" sentinel.
 */
export function isPainEntry(entry: EntryLike): boolean {
  // Primary: explicit entry_kind field (added via migration)
  if (entry.entry_kind) {
    return entry.entry_kind === 'pain';
  }

  // Fallback: legacy entries without entry_kind
  // pain_level must exist AND not be a "no pain" value
  const pl = entry.pain_level;
  if (pl === null || pl === undefined) return false;

  const str = String(pl).trim();
  if (str === '' || str === '-' || str === '0') return false;

  return true;
}
