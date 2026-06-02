// Legacy entrypoint — kept so the existing Deno tests in this folder
// (`postprocess_test.ts`) continue to work. The real implementation
// now lives in `../_shared/patternAnalysisPostprocess.ts` so the
// Supabase Edge Function deploy bundler can resolve it from sibling
// function folders (e.g. `analyze-voice-patterns-shared`).
export {
  postprocessExpandedFindings,
  V21_CATEGORIES,
  V21_EVIDENCE,
  V21_SOURCE_BASIS,
  V21_RELEVANCE,
  MAX_EXPANDED_FINDINGS,
  type ExpandedFinding,
} from "../_shared/patternAnalysisPostprocess.ts";
