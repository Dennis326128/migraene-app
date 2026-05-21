/**
 * Pure UI gating decision for the cached pattern-analysis display.
 *
 * Centralizes the rule: when a previously generated report belongs to a
 * different time range than the one currently selected, do NOT auto-
 * render the full analysis. Show a CTA + preview card and require an
 * explicit user action ("Letzte Analyse anzeigen") first.
 *
 * All other stale reasons (version_mismatch, data_changed, age_expired)
 * keep rendering the report directly because the range still matches.
 */

export type CachedStaleReason = 'data_changed' | 'version_mismatch' | 'range_mismatch' | null;

export interface CachedAnalysisDisplayInput {
  hasResult: boolean;
  staleReason: CachedStaleReason;
  /** User explicitly opted in to view the older fallback report. */
  showFallbackAnalysis: boolean;
}

export type CachedAnalysisDisplayMode =
  | 'empty'                  // no report at all -> show normal empty state
  | 'render_full'            // render <AnalysisResults> directly
  | 'range_mismatch_preview' // show CTA + PreviousAnalysisCard, no analysis
  | 'range_mismatch_full';   // user opted in -> render analysis with badge

export function decideCachedAnalysisDisplay(
  input: CachedAnalysisDisplayInput,
): CachedAnalysisDisplayMode {
  if (!input.hasResult) return 'empty';
  if (input.staleReason === 'range_mismatch') {
    return input.showFallbackAnalysis ? 'range_mismatch_full' : 'range_mismatch_preview';
  }
  return 'render_full';
}
